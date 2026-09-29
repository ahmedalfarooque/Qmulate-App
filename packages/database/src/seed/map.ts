// QMULATE — fixture → Prisma create-input mappers.
//
// EVERY mapping in this file is one of exactly three kinds, and each is labelled as such:
//
//   [FIXTURE]  a value copied straight from `data/fixtures/sample-waqf.json`.
//   [MAPPED]   a fixture string translated through a TOTAL map into a schema enum. Total means
//              `satisfies Record<…>` plus a throwing lookup: an unmapped fixture value is a hard
//              error, never a silent default. A fixture change cannot half-seed the database.
//   [DERIVED]  a value the fixture does not contain, which the schema requires. Every derivation
//              is listed here, is a pure function of fixture values (so the seed stays
//              byte-reproducible), and carries a comment saying it is derived.
//
// NOTHING in this file invents a realistic Saudi name, IBAN, national id or deed number. Derived
// strings either reuse the fixture's own `FAKE-*` conventions or carry the Arabic fictional-data
// marker `(بيانات وهمية)`.
//
// TYPE STRATEGY: the mappers return plain objects typed with LOCAL string-literal unions rather
// than importing the generated Prisma enums. That keeps this module compilable before
// `prisma generate` has ever run, and the literal unions are assignable to Prisma's generated
// enum types (which are themselves unions of the same string literals).

import { Decimal } from 'decimal.js';

import { DomainError, computeRuleDeadline, windowSnapshotOf } from '@qmulate/domain';
import {
  OBLIGATION_LIBRARY_VERSION,
  storableTemplates,
  templateConfidentiality,
  templatesWithheldFromRegister,
  type ObligationTemplate,
} from '@qmulate/domain/compliance';
import {
  addBusinessDays,
  buildHolidayCalendar,
  civilDateFromUtcDate,
  type HolidayCalendar,
  type ObservedHoliday,
} from '@qmulate/domain/dates';
import { parseSetting } from '@qmulate/domain/settings';

import { SeedRefusedError } from '../guardrail.js';
import type {
  Fixture,
  FixtureAsset,
  FixtureBeneficiary,
  FixtureClient,
  FixtureComplianceTask,
  FixtureDistribution,
  FixtureExpense,
  FixtureExpropriation,
  FixtureGovernmentFiling,
  FixtureNazirFee,
  FixtureRevenue,
  FixtureWaqf,
  FixtureWaqif,
} from './fixture-schema.js';
import { dual, dualOrNull, type HijriDateString } from './hijri.js';
import { buildShartAlWaqif, type ShartAlWaqif } from './shart.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 0. PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE ONLY number → money boundary in the codebase.
 *
 * The fixture is JSON and JSON has no decimal type, so amounts arrive as JS numbers. They are
 * validated at 2-decimal exactness by the fixture zod schema, converted here to a fixed-scale
 * decimal STRING, and never touched as numbers again. Prisma accepts the string for a
 * `Decimal @db.Decimal(18,2)` column with no float ever entering the pipeline.
 */
export function money(value: number, field: string): string {
  const decimal = new Decimal(value);
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new SeedRefusedError(`fixture drift — ${field} is not a non-negative amount: ${value}`);
  }
  if (decimal.decimalPlaces() > 2) {
    throw new SeedRefusedError(`fixture drift — ${field} has more than 2 decimal places: ${value}`);
  }
  return decimal.toFixed(2);
}

/** Sum of fixed-scale decimal strings, still as a fixed-scale decimal string. */
function sumMoney(values: readonly string[]): string {
  return values.reduce((total, value) => total.plus(value), new Decimal(0)).toFixed(2);
}

function subtractMoney(minuend: string, subtrahends: readonly string[]): string {
  return subtrahends.reduce((total, value) => total.minus(value), new Decimal(minuend)).toFixed(2);
}

/** Throwing lookup — the mechanism that makes every enum map TOTAL. */
function mapValue<T>(map: Readonly<Record<string, T>>, key: string, what: string): T {
  const value = map[key];
  if (value === undefined) {
    throw new SeedRefusedError(
      `fixture drift — unmapped ${what}: ${JSON.stringify(key)}. Add it to the mapping table in ` +
        'packages/database/src/seed/map.ts rather than letting the seed guess.',
    );
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1. ENUM MAPS — total, explicit, throwing
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⊕ S9-4a — THREE size bands. `DIRECT_UTILIZATION` removed (owner ruling, fifth batch).
 *
 * ⚠ A SECOND HAND-WRITTEN COPY OF A VOCABULARY, and the narrowing found it: the domain's
 * `WAQF_CLASSIFICATIONS` and `schema.prisma`'s enum were both updated and this line still said four,
 * so the seed would have accepted a value the database no longer has. That is the exact drift class
 * this repository has been bitten by five times — recorded here rather than silently fixed, because
 * the honest remedy is that this alias should not exist at all and should be imported from
 * `@qmulate/domain`. ⚠ It cannot be today: `packages/database`'s seed layer deliberately does not
 * depend on the domain package's runtime exports. So the copy stays, narrowed, and
 * `prisma-vocabulary-parity.test.ts` is what compares it.
 */
export type WaqfClassificationValue = 'LARGE' | 'MEDIUM' | 'SMALL';
export type WaqfTypeValue = 'PUBLIC_CHARITABLE' | 'FAMILY_DHURRI' | 'JOINT';
export type WaqfNatureValue = 'AYNI' | 'QIYAMI';
/** ⚠ `LINEAGE_CONTINUATION` landed in migration 12 (S4/E3) — ADR-0009 R4's NORMAL deed shape. */
export type EntitlementOrderValue = 'LINEAGE_CONTINUATION' | 'ORDERED' | 'SHARED' | 'NA_DIRECT_USE';
/** A CLOSED two-value deed term (ADR-0009 R2). No third member, and no default anywhere. */
export type ContinuationStipulationValue = 'ZUHUR_ONLY' | 'ZUHUR_AND_BUTUN';
/** The ẓuhūr/buṭūn ELIGIBILITY FACT. ⚠ Never a person's gender — read for one computation only. */
export type LineageLinkValue = 'SON' | 'DAUGHTER';
/** مآل الوقف. One member today; any other recorded reading must HALT by name, never be coerced. */
export type ReversionKindValue = 'CHARITABLE_ULTIMATE_TAKER';
/**
 * ⊕ S11-1 — WHICH date `Waqf.registrationAnchorDate` is (migration 48; owner ruling 2026-08-31,
 * 9f3d8fd: "make a drop down if that helps"). A CLOSED two-value term with NO default: the kind
 * travels with the date or neither is recorded.
 */
export type RegistrationAnchorKindValue = 'WAQF_DOCUMENTATION_DATE' | 'REGULATION_EFFECTIVE_DATE';
/**
 * The CLOSED asset-status vocabulary (product owner 2026-08-16, decisions log D-A). Migration 13
 * makes it a native Postgres enum, so a value outside this union is not merely ungated — it cannot
 * be stored. `EXPROPRIATED` and `SUBSTITUTED_ISTIBDAL` are the RESERVED pair.
 */
export type AssetStatusValue =
  | 'ACTIVE'
  | 'FULLY_RENTED'
  | 'PARTIALLY_RENTED'
  | 'VACANT'
  | 'EXPROPRIATED'
  | 'SUBSTITUTED_ISTIBDAL';
export type BeneficiaryLineValue = 'ZUHUR' | 'BUTUN' | 'NA';
export type BeneficiaryKindValue = 'FAMILY' | 'CHARITABLE_JIHA' | 'CATEGORY_ONLY';
export type BeneficiaryResidencyValue = 'DOMESTIC' | 'CROSS_BORDER';
export type VerificationStatusValue = 'VERIFIED' | 'PENDING' | 'UNVERIFIED';
export type ConfidentialityValue = 'NORMAL' | 'SENSITIVE_PII' | 'AML_RESTRICTED';
export type TxnTypeValue = 'REVENUE' | 'EXPENSE';
export type ExpenseCategoryValue = 'MAINTENANCE' | 'OPERATIONS' | 'NAZIR_FEE' | 'ZAKAT' | 'OTHER';
export type ReceiptClassValue = 'INCOME' | 'CAPITAL';
export type CapitalSourceValue =
  'SALE_PROCEEDS' | 'ISTIBDAL_PROCEEDS' | 'EXPROPRIATION_COMPENSATION' | 'OTHER';
export type FeeBasisValue = 'PERCENT_OF_REVENUE' | 'PERCENT_OF_NET_INCOME' | 'RETAINER';
export type DistributionStatusValue =
  'DRAFT' | 'COMPUTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'EXECUTED' | 'CANCELLED';
export type DistributionLineStatusValue = 'PAID' | 'WITHHELD' | 'CROSS_BORDER_PENDING' | 'EXCLUDED';
export type ComplianceSectionValue = 'FINANCIAL' | 'OPERATIONAL' | 'GOVERNMENT_LEGAL';
export type ComplianceTaskStatusValue =
  'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'RETIRED' | 'NOT_APPLICABLE';
export type ClassificationGateValue =
  'ALL' | 'LARGE_MEDIUM' | 'SMALL_DIRECT' | 'EXCLUDE_DIRECT' | 'HAS_INCOME' | 'LARGE_ONLY';
export type FilingStatusValue =
  'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'N_A';
export type GovernmentPlatformValue =
  'AWQAF_DIGITAL' | 'BALADI' | 'EJAR' | 'ISTIHKAM' | 'MUQEEM' | 'QIWA';
/** §10's canonical thirteen. Narrowed 2026-07-27 — see ADR-0004. */
export type RoleValue =
  | 'SYSTEM_ADMIN'
  | 'NAZIR'
  | 'AUTHORIZED_REP'
  | 'CASE_MANAGER'
  | 'FINANCE'
  | 'COMPLIANCE_OFFICER'
  | 'AML_OFFICER'
  | 'COUNSEL'
  | 'AUDITOR'
  | 'SUBCONTRACTOR'
  | 'FAMILY_BOARD'
  | 'LEADERSHIP'
  | 'BENEFICIARY';

/**
 * ⊕ S9-4a — THREE size bands. `'direct-utilization'` is GONE as a classification value (owner
 * ruling, fifth batch, 2026-08-25: it is an orthogonal usage attribute, not a size).
 *
 * ⚠ Its ABSENCE here is a control, not tidiness: `mapValue` refuses an unrecognised key by name, so
 * a fixture still carrying `"classification": "direct-utilization"` fails the SEED with a message
 * naming the value — rather than being coerced to a size nobody chose. The fixture moved with this
 * change (`waqf-004` is now `small` + `directUtilization: true`), and migration 42 refuses to apply
 * over any DATABASE row still holding the old enum value.
 */
const CLASSIFICATION = {
  large: 'LARGE',
  medium: 'MEDIUM',
  small: 'SMALL',
} as const satisfies Record<string, WaqfClassificationValue>;

const WAQF_TYPE = {
  public_charitable: 'PUBLIC_CHARITABLE',
  family_dhurri: 'FAMILY_DHURRI',
  joint: 'JOINT',
} as const satisfies Record<string, WaqfTypeValue>;

const WAQF_NATURE = {
  ayni: 'AYNI',
  qiyami: 'QIYAMI',
} as const satisfies Record<string, WaqfNatureValue>;

const ENTITLEMENT_ORDER = {
  lineage_continuation: 'LINEAGE_CONTINUATION',
  ordered: 'ORDERED',
  shared: 'SHARED',
  'n/a (direct use of the asset)': 'NA_DIRECT_USE',
} as const satisfies Record<string, EntitlementOrderValue>;

/**
 * ⚠ TWO VALUES AND NO FALLBACK. `mapValue` THROWS on anything else, which is the point: a
 * mis-transcribed continuation stipulation must refuse to seed rather than resolve to a reading
 * nobody chose. Absence is expressed by `null` in the fixture and never reaches this map.
 */
const CONTINUATION_STIPULATION = {
  zuhur_only: 'ZUHUR_ONLY',
  zuhur_and_butun: 'ZUHUR_AND_BUTUN',
} as const satisfies Record<string, ContinuationStipulationValue>;

/** ⚠ NOT a gender. The ẓuhūr/buṭūn eligibility fact, read for exactly one computation. */
const LINEAGE_LINK = {
  son: 'SON',
  daughter: 'DAUGHTER',
} as const satisfies Record<string, LineageLinkValue>;

/**
 * مآل الوقف. ONE member, deliberately: a deed reverting to another waqf, to the Authority or to the
 * waqif's nearest relatives must HALT BY NAME (`REVERSION_KIND_UNRECOGNISED`) rather than be
 * coerced into the one reading the product owner gave on 2026-08-10 (Binding rule 1).
 */
const REVERSION_KIND = {
  charitable_ultimate_taker: 'CHARITABLE_ULTIMATE_TAKER',
} as const satisfies Record<string, ReversionKindValue>;

/** ⊕ S11-1 — the fixture's lowercase spellings of `RegistrationAnchorKind`, and nothing else. */
const REGISTRATION_ANCHOR_KIND = {
  waqf_documentation_date: 'WAQF_DOCUMENTATION_DATE',
  regulation_effective_date: 'REGULATION_EFFECTIVE_DATE',
} as const satisfies Record<string, RegistrationAnchorKindValue>;

/**
 * ⚠ THE TWO RESERVED MEMBERS ARE DELIBERATELY ABSENT FROM THE FIXTURE'S REACH, AND THAT IS A
 * DECISION RATHER THAN AN OVERSIGHT. `expropriated` and `substituted_istibdal` are states a corpus
 * asset only enters through an approved reserved matter (BR-306); the seed writes rows on INSERT,
 * which `asset_identity_guard` does not gate, so a fixture that named one would MANUFACTURE a
 * disposal that no approval ever authorised — and it would sit in the database looking exactly like
 * a real one. `sample-waqf.json`'s own `exp-001` says the only expropriation in the fixture is
 * ANNOUNCED and its istibdal is `pending_authority_permission`, i.e. neither act has completed.
 *
 * If a seeded reserved state is ever needed, it must arrive with a seeded `ApprovalRequest` beside
 * it, the way `deriveRunApprovals` does for an executed distribution.
 */
/**
 * The FIXTURE-side spellings, and the third layer at which `sold` is unrepresentable.
 *
 * ✓ VERIFIED for memo Q9 (product owner 2026-08-17: *"remove 'sold'. since an endowment asset cannot
 * be sold, if expropriated by government - they will replace with similar valued asset."*) — there
 * was NOTHING TO REMOVE, and that was measured rather than read: `sold` is absent from this map (so
 * `mapValue` HALTS on it, naming the value), absent from {@link AssetStatusValue}, and absent from the
 * Postgres enum, where the live catalogue has exactly six labels and `'sold'` — or its Arabic
 * `'مبيع'` — is refused **22P02** at type parse. The two RESERVED members are deliberately absent
 * HERE too: a fixture may state an occupancy, never a disposal, because a disposal is a transition
 * through BR-306's gate and not a starting state (migrations 14/15).
 */
const ASSET_STATUS = {
  active: 'ACTIVE',
  fully_rented: 'FULLY_RENTED',
  partially_rented: 'PARTIALLY_RENTED',
  vacant: 'VACANT',
} as const satisfies Record<string, AssetStatusValue>;

const BENEFICIARY_KIND = {
  family: 'FAMILY',
  charitable_jiha: 'CHARITABLE_JIHA',
  category_only: 'CATEGORY_ONLY',
} as const satisfies Record<string, BeneficiaryKindValue>;

const BENEFICIARY_LINE = {
  zuhur: 'ZUHUR',
  butun: 'BUTUN',
  'n/a': 'NA',
} as const satisfies Record<string, BeneficiaryLineValue>;

/**
 * BR-511's routing fact, MAPPED FROM FIXTURE DATA since S5/E4. The mapper used to hardcode
 * `residency: 'DOMESTIC'` — conservative, but it made a cross-border member inexpressible in the
 * seed and left the BR-511 path with no seeded subject. Explicitness is the point: a defaulted
 * `domestic` silently routes a cross-border payment as domestic.
 */
const BENEFICIARY_RESIDENCY = {
  domestic: 'DOMESTIC',
  cross_border: 'CROSS_BORDER',
} as const satisfies Record<string, 'DOMESTIC' | 'CROSS_BORDER'>;

/**
 * BINDING RULE 1's discriminator, mapped from FIXTURE DATA since S4/E3.
 *
 * ⚠ THE MAPPER USED TO DECIDE THIS. `mapRevenue` wrote `receiptClass: 'INCOME'` unconditionally,
 * with a comment saying both fixture rows happen to be rent. That is a classification decision taken
 * by code about a corpus/income question — the exact thing Binding rule 1 forbids, and the reason a
 * capital receipt entering through this path would have reached the distribution waterfall.
 */
const RECEIPT_CLASS = {
  income: 'INCOME',
  capital: 'CAPITAL',
} as const satisfies Record<string, ReceiptClassValue>;

const CAPITAL_SOURCE = {
  sale_proceeds: 'SALE_PROCEEDS',
  istibdal_proceeds: 'ISTIBDAL_PROCEEDS',
  expropriation_compensation: 'EXPROPRIATION_COMPENSATION',
  other: 'OTHER',
} as const satisfies Record<string, CapitalSourceValue>;

const VERIFICATION_STATUS = {
  verified: 'VERIFIED',
  pending: 'PENDING',
  unverified: 'UNVERIFIED',
} as const satisfies Record<string, VerificationStatusValue>;

const EXPENSE_CATEGORY = {
  maintenance: 'MAINTENANCE',
  operations: 'OPERATIONS',
  nazir_fee: 'NAZIR_FEE',
  zakat: 'ZAKAT',
  other: 'OTHER',
} as const satisfies Record<string, ExpenseCategoryValue>;

const FEE_BASIS = {
  percent_of_revenue: 'PERCENT_OF_REVENUE',
  percent_of_net_income: 'PERCENT_OF_NET_INCOME',
  retainer: 'RETAINER',
} as const satisfies Record<string, FeeBasisValue>;

/**
 * The two `DistributionStatus` values that CANNOT exist without an `ApprovalRequest` (E2 CHECK
 * `distribution_approved_requires_approval_request`). Kept beside the status map so the two can be
 * read together.
 */
const REQUIRES_APPROVAL_STATUSES: ReadonlySet<string> = new Set(['APPROVED', 'EXECUTED']);

const DISTRIBUTION_STATUS = {
  draft: 'DRAFT',
  computed: 'COMPUTED',
  pending_approval: 'PENDING_APPROVAL',
  approved: 'APPROVED',
  /** The fixture's `"completed"` is a historical, already-paid run → EXECUTED. */
  completed: 'EXECUTED',
  cancelled: 'CANCELLED',
} as const satisfies Record<string, DistributionStatusValue>;

const COMPLIANCE_SECTION = {
  financial: 'FINANCIAL',
  operational: 'OPERATIONAL',
  government_legal: 'GOVERNMENT_LEGAL',
} as const satisfies Record<string, ComplianceSectionValue>;

const COMPLIANCE_TASK_STATUS = {
  not_started: 'NOT_STARTED',
  in_progress: 'IN_PROGRESS',
  completed: 'COMPLETED',
  retired: 'RETIRED',
  not_applicable: 'NOT_APPLICABLE',
} as const satisfies Record<string, ComplianceTaskStatusValue>;

const CLASSIFICATION_GATE = {
  all: 'ALL',
  large_medium: 'LARGE_MEDIUM',
  small_direct: 'SMALL_DIRECT',
  // ⊕ S8-Q3 (owner, 2026-08-23). These are §09's own lowercase spellings; the map exists because a
  // `satisfies Record<...>` map is the ONE place a fixture string becomes an enum member, and a gate
  // added to the enum stays UNREACHABLE from the fixture until it gains a key here.
  exclude_direct: 'EXCLUDE_DIRECT',
  has_income: 'HAS_INCOME',
  // ⚠ RETIRED, and the key is KEPT deliberately. Refused-not-remapped means an old fixture or an old
  // import may still carry the string, and it must translate to the enum member so the ENGINE can
  // refuse it by name. Removing the key would turn a reportable refusal into an unrecognised-value
  // error, which tells the reader something different and less true.
  large_only: 'LARGE_ONLY',
} as const satisfies Record<string, ClassificationGateValue>;

/**
 * Government filing status.
 *
 * `"registered"` → `ACCEPTED`: the canonical enum's ACCEPTED means "the platform accepted the
 * filing", which is exactly what the Awqaf platform calls "registered".
 *
 * `"pending"` → `NOT_STARTED` (JUSTIFICATION, since SUBMITTED is the other candidate): the only
 * fixture row with this status is gov-002, whose `lastUpdated` is null. A submitted filing always
 * has a submission timestamp; with none recorded there is no evidence anything was lodged.
 * Claiming SUBMITTED on a compliance record we cannot evidence would overstate the endowment's
 * position to a regulator, so the conservative reading wins. If the fixture later carries a
 * `"pending"` row WITH a `lastUpdated`, this mapping must be revisited rather than reused.
 */
const FILING_STATUS = {
  not_started: 'NOT_STARTED',
  pending: 'NOT_STARTED',
  in_progress: 'IN_PROGRESS',
  submitted: 'SUBMITTED',
  registered: 'ACCEPTED',
  accepted: 'ACCEPTED',
  rejected: 'REJECTED',
  'n/a': 'N_A',
} as const satisfies Record<string, FilingStatusValue>;

const GOVERNMENT_PLATFORM = {
  'Awqaf Digital': 'AWQAF_DIGITAL',
  Baladi: 'BALADI',
  Ejar: 'EJAR',
  Istihkam: 'ISTIHKAM',
  Muqeem: 'MUQEEM',
  Qiwa: 'QIWA',
} as const satisfies Record<string, GovernmentPlatformValue>;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2. [DERIVED] ARABIC SEED COPY
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The fixture contains ZERO Arabic, yet every Arabic-authoritative column (`nameAr`, `addressAr`,
// `relationshipAr`, `descriptionAr`, `titleAr`, `workstreamAr`, `bankNameAr`, `authorityAr`) is
// REQUIRED (NFR-01). These strings are therefore DERIVED SEED COPY, pinned here in one table so
// no two code paths invent different Arabic for the same record.
//
// They are transliterations/translations of values that were ALREADY FICTIONAL, and every proper
// noun keeps the marker `(بيانات وهمية)` = "fictional data". They are NOT authoritative Arabic and
// must never be presented as a real endowment's legal text.

const CLIENT_NAME_AR: Readonly<Record<string, string>> = {
  'client-001': 'عائلة الراشدي (بيانات وهمية)',
};

const WAQIF_NAME_AR: Readonly<Record<string, string>> = {
  'waqif-001': 'إبراهيم الراشدي (بيانات وهمية)',
  'waqif-002': 'سليمان الراشدي (بيانات وهمية)',
  'waqif-003': 'عائشة الراشدي (بيانات وهمية)',
};

const ADDRESS_AR: Readonly<Record<string, string>> = {
  'Example District, Example City': 'حي المثال، مدينة المثال',
  'Example Commercial Street, Example City': 'شارع المثال التجاري، مدينة المثال',
  'Example Residential Road, Example City': 'طريق المثال السكني، مدينة المثال',
  'Example Business Bay, Example City': 'خليج الأعمال المثال، مدينة المثال',
  'Example North Plot, Example City': 'قطعة المثال الشمالية، مدينة المثال',
  'Example Family Compound, Example City': 'مجمع المثال العائلي، مدينة المثال',
  // [DERIVED] seed copy, added M1-b with asset-007 (waqf-007, the computing lineage sibling).
  // Ordinary address vocabulary, invented like the six above — NOT product-approved legal copy.
  'Example Orchard Lane, Example City': 'حارة البستان المثال، مدينة المثال',
};

const AUTHORITY_AR: Readonly<Record<string, string>> = {
  'Example Municipality (fictional)': 'أمانة المثال (بيانات وهمية)',
};

/**
 * ⚠ `kind` IS NO LONGER DERIVED FROM THIS TABLE (S4/E3). It used to be: the mapper read
 * `BeneficiaryKind` off the relationship PROSE, so `'charitable cause'` MADE a row a
 * `CHARITABLE_JIHA`. Two consequences, and both were real:
 *
 *   ·  a `CATEGORY_ONLY` beneficiary was inexpressible without inventing a relationship label for
 *      it, which is why the `CATEGORY_NOT_CAPTURED` gate (BR-206) had no fixture subject at all;
 *   ·  a beneficiary's CLASS — which decides whether it needs a lineage edge, whether it may sit in
 *      a ذري cohort, and whether the reversion ladder applies to it — was a function of free text.
 *
 * The kind is now DATA in the fixture. This table keeps the bilingual copy, and `expectedKind` is
 * retained as a CROSS-CHECK: the two sides must agree, and `mapBeneficiary` refuses rather than
 * preferring one. `null` means the label carries no expectation (a category placeholder).
 */
interface RelationshipCopy {
  readonly ar: string;
  readonly en: string;
  readonly expectedKind: BeneficiaryKindValue | null;
}

const RELATIONSHIP: Readonly<Record<string, RelationshipCopy>> = {
  'child of waqif': { ar: 'ابن الواقف', en: 'child of waqif', expectedKind: 'FAMILY' },
  grandchild: { ar: 'حفيد', en: 'grandchild', expectedKind: 'FAMILY' },
  // [DERIVED] seed copy, added S5/E4 for waqf-005's third generation (ben-208/209/215/216).
  // Ordinary kinship vocabulary, same provenance class as the rows above — NOT product-approved
  // legal copy (that review path is E10/E12's).
  'great-grandchild': { ar: 'ابن الحفيد', en: 'great-grandchild', expectedKind: 'FAMILY' },
  'charitable cause': { ar: 'جهة خيرية', en: 'charitable cause', expectedKind: 'CHARITABLE_JIHA' },
  'category (not individually identified)': {
    ar: 'فئة غير محددة الأفراد',
    en: 'category (not individually identified)',
    expectedKind: 'CATEGORY_ONLY',
  },
};

interface TransactionCopy {
  readonly ar: string;
  readonly en: string;
}

const REVENUE_COPY: Readonly<Record<string, TransactionCopy>> = {
  rent: { ar: 'إيراد إيجار', en: 'Rent revenue' },
  // [DERIVED] seed copy, added S5/E4 with rev-004 — the fixture's first CAPITAL receipt. Ordinary
  // ledger vocabulary, not legal copy. The receipt CLASS (corpus, Binding rule 1) is carried by
  // `receiptClass`/`capitalSource`, never by this label.
  expropriation_compensation: { ar: 'تعويض نزع ملكية', en: 'Expropriation compensation' },
  // [DERIVED] seed copy, added S7 with rev-005 — waqf-001's FIRST AND ONLY CAPITAL receipt.
  // rev-004's corpus row is on waqf-003, so a run scoped to waqf-001 dropped it on the `waqfId`
  // filter BEFORE `receiptClass` was ever consulted: the corpus wall looked proven and was not.
  //
  // Ordinary ledger vocabulary, INVENTED sample copy — NOT legal copy and NOT a refusal-code
  // statement (those go through the i18n owed register, never through a fixture change). The
  // corpus CLASS travels in `receiptClass`/`capitalSource`, never in this label.
  //
  // ⚠ DELIBERATELY CARRIES NO `(بيانات وهمية)` MARKER, and the brief asked for one. `descriptionAr`
  // is a RENDERED column: rev-005 would be the only `transaction` row in the database with a
  // harness marker inside a column a Nazir reads, and the neighbouring two rows carry none. The
  // invented-ness is recorded where a reader looks for provenance instead — the fixture row's own
  // `note` and `_readme`. Reversing this is a one-string change here; it is a copy decision, not a
  // data one.
  istibdal_proceeds: { ar: 'حصيلة استبدال', en: 'Istibdal (substitution) proceeds' },
};

const EXPENSE_COPY: Readonly<Record<string, TransactionCopy>> = {
  maintenance: { ar: 'مصروف صيانة', en: 'Maintenance expense' },
  nazir_fee: { ar: 'أتعاب الناظر (عُشر)', en: 'Nazir fee (ʿushr)' },
  operations: { ar: 'مصروفات تشغيلية', en: 'Operating expenses' },
};

/** Arabic titles for the obligations derived from the fixture's compliance tasks. */
const OBLIGATION_TITLE_AR: Readonly<Record<string, string>> = {
  'task-001': 'تسوية الحساب البنكي للوقف مع دفتر الأستاذ',
  'task-002': 'احتساب وتوزيع الغلة الربعية على المستحقين',
  'task-003': 'إعداد القوائم المالية السنوية المراجعة',
  'task-004': 'إعداد القائمة المالية السنوية للوقف الصغير',
  'task-005': 'تحديث بيانات تسجيل الوقف لدى الهيئة العامة للأوقاف',
  'task-006': 'التحقق من بيانات المستفيد الحقيقي وتحديثها',
  'task-007': 'استئذان الهيئة والإشعار بالاستبدال خلال عشرة أيام عمل',
  'task-008': 'معاينة الوحدة التجارية الشاغرة والبدء في تأجيرها',
  // ⚠ ADDED IN S4/E3 so the §17 E3 exit CONTRAST has a subject at all. Both are gate
  // `large_medium` on waqf-001, the MEDIUM endowment, and neither existed before: waqf-001 carried
  // no LARGE_MEDIUM-gated obligation, so "the MEDIUM waqf shows obligations the SMALL one does not"
  // was unsatisfiable against the old fixture — the comparison would have passed over an empty set.
  // ⚠ The 200M/50M bands that decide which endowment is MEDIUM live in `Setting` and are
  // "⚠ unverified — confirm vs primary law".
  'task-009':
    'إعداد القوائم المالية السنوية المراجعة وفق معايير الهيئة السعودية للمراجعين والمحاسبين',
  'task-010': 'إقرار اللائحة الداخلية للوقف وإيداعها',
};

const WORKSTREAM_AR: Readonly<Record<string, string>> = {
  Accounting: 'المحاسبة',
  Governance: 'الحوكمة',
  Distribution: 'التوزيع',
  'Zakat & tax': 'الزكاة والضريبة',
  'Awqaf Authority registration': 'التسجيل لدى الهيئة العامة للأوقاف',
  'AML/CFT': 'مكافحة غسل الأموال وتمويل الإرهاب',
  'Expropriation / istibdal': 'نزع الملكية والاستبدال',
  'Property management': 'إدارة الأملاك',
};

/** [DERIVED] Bank name for the fixture's dedicated waqf accounts. Fictional, marked as such. */
const BANK_NAME_AR = 'بنك المثال (بيانات وهمية)';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3. DETERMINISTIC DERIVED IDS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Fixture ids are used VERBATIM as primary keys. Every id the fixture does not supply is a PURE
// FUNCTION of fixture values — no cuid(), no Math.random(), no Date.now() — so a fresh
// migrate + seed reproduces byte-identical rows and therefore a byte-identical audit hash chain.

export const derivedId = {
  trusteeship: (waqfId: string): string => `trust-${waqfId}`,
  /** ⊕ S12-3 · one row per (endowment, gate): `gate-waqf-004-2` is waqf-004's Gate 02. */
  onboardingGate: (waqfId: string, rank: 1 | 2 | 3): string => `gate-${waqfId}-${String(rank)}`,
  bankAccount: (accountRef: string): string =>
    `bankacct-${accountRef.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  /**
   * The bank's own reference for a seeded movement (migration 20 §1).
   *
   * ⚠ INVENTED FIXTURE DATA, and shaped so it cannot be mistaken for a real bank's format. The
   * reconciliation matches on this and on nothing else — never on amount and date, which would
   * silently mis-pair four identical rents collected on the first of the month.
   */
  bankReference: (transactionId: string): string => `FAKE-BNK-${transactionId.toUpperCase()}`,
  obligation: (code: string): string => `oblig-${code}`,
  /**
   * A row of the CANONICAL §09 library — id qualified by the library version.
   *
   * ⚠ **`obligation()` ABOVE COULD NOT BE REUSED, and the reason is S8-Q5.** It is `oblig-<code>`,
   * which was safe while `UNIQUE (code)` made one row per code the only possibility. Migration 31
   * replaced that with `UNIQUE (code, libraryVersion)` precisely so a corrected obligation can be
   * published as a SECOND ROW carrying the same code — and two rows sharing `oblig-FIN-ACC-01`
   * cannot both exist. So the id has to carry the version, or the first republished template
   * collides on the primary key and the versioning the owner ruled on is unusable in the one place
   * it is meant to be used.
   *
   * ⚠ The ten `SEED-` PLACEHOLDER ids are deliberately NOT moved onto this shape. Migration 31's
   * `compliance_obligation_id_immutable` refuses the change, and an id change in a seed that upserts
   * on id would not rewrite them anyway — it would insert ten more rows and orphan the tasks
   * snapshotted against the old ones.
   */
  libraryObligation: (code: string, libraryVersion: string): string =>
    `oblig-${libraryVersion}-${code}`,
  distributionLineItem: (distributionId: string, beneficiaryId: string): string =>
    `dli-${distributionId}-${beneficiaryId}`,
  grant: (userId: string, waqfId: string): string => `grant-${userId}-${waqfId}`,
  membership: (userId: string, clientId: string): string => `membership-${userId}-${clientId}`,
  credentialAccount: (userId: string): string => `credacct-${userId}`,
  /** The maker-checker record that authorised a distribution run. See `deriveRunApprovals`. */
  runApproval: (distributionId: string): string => `appr-${distributionId}`,
  /** One row per (endowment × named ultimate taker). See `deriveReversionTakers`. */
  reversionTaker: (waqfId: string, beneficiaryId: string): string =>
    `maal-${waqfId}-${beneficiaryId}`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4. ROW SHAPES
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Each mapper returns `{ id, data }`. The seed writes `create: { id, ...data }, update: data`,
// which is what makes a re-run converge every row back onto the fixture rather than merely
// skipping it. `Waqf` is the exception — see `MappedWaqf`.

export interface Mapped<T> {
  readonly id: string;
  readonly data: T;
}

export interface ClientData {
  readonly nameAr: string;
  readonly nameEn: string;
}

export function mapClient(client: FixtureClient): Mapped<ClientData> {
  return {
    id: client.id, // [FIXTURE]
    data: {
      nameAr: mapValue(CLIENT_NAME_AR, client.id, 'client Arabic name'), // [DERIVED] seed copy
      nameEn: client.name, // [FIXTURE]
    },
  };
}

export interface WaqifData {
  readonly clientId: string;
  readonly nameAr: string;
  readonly nameEn: string;
}

export function mapWaqif(waqif: FixtureWaqif): Mapped<WaqifData> {
  return {
    id: waqif.id, // [FIXTURE]
    data: {
      clientId: waqif.clientId, // [FIXTURE]
      nameAr: mapValue(WAQIF_NAME_AR, waqif.id, 'waqif Arabic name'), // [DERIVED] seed copy
      nameEn: waqif.name, // [FIXTURE]
    },
  };
}

/**
 * `Waqf` splits its payload in two.
 *
 * `immutable` holds the Shart al-Waqif columns. They are written ONLY on INSERT and are
 * DELIBERATELY EXCLUDED from the upsert's `update` branch: under Binding rule 1 the Shart is
 * write-once, and the `waqf_shart_immutable` database trigger rejects any UPDATE that touches
 * `shartAlWaqif` or `shartAlWaqifVersion` unless a verified reserved-matter approval has set the
 * transaction-local GUC. A re-run of the seed is exactly the kind of "correction" that must not
 * be able to rewrite a founder's conditions — so the seed does not even try.
 */
export interface WaqfMutableData {
  readonly waqifId: string;
  readonly certificateNumber: string;
  readonly deedNumber: string;
  readonly classification: WaqfClassificationValue;
  /**
   * ⊕ S9-4a — ذات انتفاع مباشر, the orthogonal usage axis. ⚠ NULLABLE, and NULL means UNRECORDED and
   * never "not direct" (owner ruling). Every fixture endowment STATES it explicitly — a seeded
   * record that left it null would be shipping the unrecorded state as an example, and the gate
   * resolver refuses to gate on it.
   */
  readonly directUtilization: boolean | null;
  readonly type: WaqfTypeValue;
  readonly nature: WaqfNatureValue;
  readonly entitlementOrder: EntitlementOrderValue;
  readonly fiscalYearEnd: string;
  readonly registrationDate: Date;
  readonly registrationDateHijri: HijriDateString;
  readonly certificateExpiry: Date | null;
  readonly certificateExpiryHijri: HijriDateString | null;
  /**
   * ⊕ S11-1 — the `REGISTER_30BD` clock-start (migration 48). In the MUTABLE half deliberately: the
   * owner ruled these dates EDITABLE (f57e13d), so a seed re-run restating one is an ordinary
   * audited UPDATE, not a refused "correction". All three null together or none (the CHECKs).
   */
  readonly registrationAnchorDate: Date | null;
  readonly registrationAnchorDateHijri: HijriDateString | null;
  readonly registrationAnchorKind: RegistrationAnchorKindValue | null;
}

export interface WaqfImmutableData {
  readonly shartAlWaqif: ShartAlWaqif;
  readonly shartAlWaqifVersion: number;
  readonly shartAlWaqifSetAt: Date;
  readonly shartAlWaqifSetAtHijri: HijriDateString;

  // ── THE WRITE-ONCE DEED TERMS (S4/E3, migration 12 tier 3) ────────────────────────────────
  // They live in the IMMUTABLE half for the same reason the Shart does: they are founder's
  // conditions, they are absent from the upsert's `update` branch, and a seed re-run is exactly the
  // "correction" that must never be able to restate one. The database agrees — tier 3 permits
  // NULL -> value ONCE and refuses value -> anything, including value -> NULL.
  //
  // ⚠ NO DEFAULTS ANYWHERE ON THIS BLOCK (binding rule 6). Each value is a FIXTURE FACT, and a
  // fixture that omits the key is refused by the zod gate rather than defaulted here.
  readonly continuationStipulation: ContinuationStipulationValue | null;
  readonly reversionClauseCaptured: boolean;
  readonly reversionKind: ReversionKindValue | null;
  readonly reversionRecordedAt: Date | null;
  readonly reversionRecordedAtHijri: HijriDateString | null;
}

/** One row of `waqf_reversion_taker` — a beneficiary the DEED names as an ultimate taker. */
export interface ReversionTakerData {
  readonly waqfId: string;
  readonly beneficiaryId: string;
}

export interface MappedWaqf {
  readonly id: string;
  readonly data: WaqfMutableData;
  readonly immutable: WaqfImmutableData;
}

export function mapWaqf(
  waqf: FixtureWaqf,
  beneficiaries: readonly FixtureBeneficiary[],
  nazirFee: FixtureNazirFee | undefined,
): MappedWaqf {
  // ⊕ S11 item 2a — the certificate expiry pair, dual or both null (REQUIRED fixture key).
  const certificate = dualOrNull(waqf.certificate?.expiry ?? null, `${waqf.id}.certificate.expiry`);
  const registration = dual(waqf.registrationDate, `${waqf.id}.registrationDate`); // [FIXTURE]+[DERIVED Hijri]
  // The provenance of a founder's condition: WHEN somebody read this deed's مآل clause.
  //
  // ⚠ IT PAIRS WITH THE CAPTURE, NOT WITH THE KIND (AV-1, S4/E3 round 2). It used to read
  // `waqf.reversion?.recordedDate`, so a deed recording NO ultimate taker carried no date at all —
  // which left `reversionClauseCaptured` free to be flipped on its own, and the seal then closed
  // over a row that had recorded nothing. Present iff the clause has been READ; CHECK
  // `waqf_reversion_recorded_at_pairs_with_capture` says the same at the database.
  const reversionRecorded = dualOrNull(
    waqf.reversionClauseCapturedDate,
    `${waqf.id}.reversionClauseCapturedDate`,
  );
  // ⊕ S11-1 — [FIXTURE] + [DERIVED Hijri]. The KIND is mapped from the fixture's own word, never
  // inferred from the date; `null` stays null, and no arm of this expression invents a value.
  const registrationAnchor = dualOrNull(
    waqf.registrationAnchor === null ? null : waqf.registrationAnchor.date,
    `${waqf.id}.registrationAnchor.date`,
  );
  const registrationAnchorKind: RegistrationAnchorKindValue | null =
    waqf.registrationAnchor === null
      ? null
      : mapValue(
          REGISTRATION_ANCHOR_KIND,
          waqf.registrationAnchor.kind,
          'registration anchor kind',
        );
  return {
    id: waqf.id,
    data: {
      waqifId: waqf.waqifId,
      certificateNumber: waqf.certificateNumber,
      deedNumber: waqf.deedNumber,
      classification: mapValue(CLASSIFICATION, waqf.classification, 'waqf classification'), // [MAPPED]
      directUtilization: waqf.directUtilization, // [FIXTURE] — stated, never defaulted
      type: mapValue(WAQF_TYPE, waqf.type, 'waqf type'), // [MAPPED]
      nature: mapValue(WAQF_NATURE, waqf.nature, 'waqf nature'), // [MAPPED]
      entitlementOrder: mapValue(ENTITLEMENT_ORDER, waqf.entitlementOrder, 'waqf entitlementOrder'), // [MAPPED]
      fiscalYearEnd: waqf.fiscalYearEnd,
      registrationDate: registration.gregorian,
      registrationDateHijri: registration.hijri,
      // [DERIVED] The fixture records no certificate expiry. Null is the honest value; an invented
      // expiry would drive a fabricated renewal deadline.
      // ⊕ S11 item 2a — the fixture's `certificate.expiry` (dual), or both null: "no certificate expiry on
      // record", said. The certificate ARM of UPDATE_15BD reads exactly this pair.
      certificateExpiry: certificate.gregorian,
      certificateExpiryHijri: certificate.hijri,
      // [FIXTURE] ⊕ S11-1 — the clock-start, or its recorded absence.
      registrationAnchorDate: registrationAnchor.gregorian,
      registrationAnchorDateHijri: registrationAnchor.hijri,
      registrationAnchorKind,
    },
    immutable: {
      // [DERIVED] structure from prose + the recorded deed terms. The Hijri snapshot is passed IN
      // because `shart.ts` keeps zero internal imports (it is meant to move to `@qmulate/domain`).
      shartAlWaqif: buildShartAlWaqif(waqf, beneficiaries, nazirFee, reversionRecorded.hijri),
      shartAlWaqifVersion: 1,
      // [DERIVED] The deed's conditions took effect when the endowment was registered.
      shartAlWaqifSetAt: registration.gregorian,
      shartAlWaqifSetAtHijri: registration.hijri,

      // [FIXTURE] — deed facts, mapped, never inferred. `null` is a recorded statement that the
      // deed continues no particular line (a خيري or direct-use deed), not a missing value.
      continuationStipulation:
        waqf.continuationStipulation === null
          ? null
          : mapValue(
              CONTINUATION_STIPULATION,
              waqf.continuationStipulation,
              'waqf continuationStipulation',
            ),
      // [FIXTURE] Whether anyone has READ this deed's مآل clause. Distinct from whether the clause
      // names anybody — see the schema comment on the column.
      reversionClauseCaptured: waqf.reversionClauseCaptured,
      reversionKind:
        waqf.reversion === null
          ? null
          : mapValue(REVERSION_KIND, waqf.reversion.kind, 'waqf reversion kind'),
      reversionRecordedAt: reversionRecorded.gregorian,
      reversionRecordedAtHijri: reversionRecorded.hijri,
    },
  };
}

/**
 * [DERIVED] The `waqf_reversion_taker` rows the deed clauses imply.
 *
 * ⚠ NOT AN INFERENCE. Each row comes from an explicit `reversion.ultimateTakerIds` entry in the
 * fixture — R7-c: the engine must never conclude a charity is the ultimate taker because it happens
 * to be present in the register. A waqf with `reversion: null` produces NO rows, and that is a
 * recorded statement rather than an absence of data.
 *
 * ⚠ THE SEEDED FIXTURE PRODUCES ZERO ROWS TODAY, DELIBERATELY. Every endowment in
 * `sample-waqf.json` records `reversion: null`. Seeding a live reversion would mean authoring a ذري
 * deed that names a charity — which is the exact configuration open defect R7-D1 (HIGH) is about, and
 * inventing one to give a table a row is not a decision this seed is entitled to take. The reversion
 * path's only fixtures stay in `packages/domain`'s `worked-examples.ts` (Examples J / J′). REPORTED.
 */
export function deriveReversionTakers(fixture: Fixture): ReadonlyArray<Mapped<ReversionTakerData>> {
  const rows: Array<Mapped<ReversionTakerData>> = [];
  for (const waqf of fixture.waqfs) {
    for (const beneficiaryId of waqf.reversion?.ultimateTakerIds ?? []) {
      rows.push({
        id: derivedId.reversionTaker(waqf.id, beneficiaryId),
        data: { waqfId: waqf.id, beneficiaryId },
      });
    }
  }
  return rows;
}

export interface TrusteeshipData {
  readonly waqfId: string;
  readonly primaryNazir: string;
  readonly primaryAppointedDate: Date;
  readonly primaryAppointedDateHijri: HijriDateString;
  readonly authorizedRepName: string | null;
  readonly authorizedRepScope: string | null;
  readonly authorizedRepAppointedDate: Date | null;
  readonly authorizedRepAppointedDateHijri: HijriDateString | null;
  readonly jointlyLiable: boolean;
  readonly successorNazir: string | null;
  readonly islam: boolean;
  readonly legalCapacity: boolean;
  readonly noDisqualifyingRemoval: boolean;
  readonly ksaResident: boolean;
  readonly saudiNationalWhereRequired: boolean | null;
  readonly authorityLicensed: boolean | null;
}

export function mapTrusteeship(waqf: FixtureWaqf): Mapped<TrusteeshipData> {
  const primary = dual(waqf.trusteeship.primary.appointedDate, `${waqf.id}.trusteeship.primary`);
  const rep = waqf.trusteeship.authorizedRepresentative;
  const repAppointed = dualOrNull(rep?.appointedDate ?? null, `${waqf.id}.trusteeship.rep`);
  return {
    id: derivedId.trusteeship(waqf.id), // [DERIVED] deterministic id
    data: {
      waqfId: waqf.id,
      primaryNazir: waqf.trusteeship.primary.nazir, // [FIXTURE]
      primaryAppointedDate: primary.gregorian,
      primaryAppointedDateHijri: primary.hijri,
      authorizedRepName: rep?.name ?? null,
      authorizedRepScope: rep?.scope ?? null,
      authorizedRepAppointedDate: repAppointed.gregorian,
      authorizedRepAppointedDateHijri: repAppointed.hijri,
      // The authorized representative is jointly and severally liable (Nazarah Art. 11(5)).
      jointlyLiable: rep?.jointlyLiable ?? false,
      successorNazir: null, // [DERIVED] not recorded in the fixture

      // ── Nazir eligibility flags (BR-109 / NFR-09) ────────────────────────────────────────
      // [DERIVED] The fixture supplies NONE of these, yet they are required non-null and BR-109
      // blocks activation without `ksaResident = true`. They are ASSERTED, NOT EVIDENCED.
      //
      // TODO(surface): LEGAL — these four flags are seeded `true` so the fixture endowments can
      // reach an active state for downstream sprints. In production each one must be evidenced by
      // a vaulted document before onboarding Gate 01 opens; a seeded `true` must never be mistaken
      // for a verified eligibility check. `authorityLicensed` is left NULL rather than guessed —
      // for a legal-person Nazir such as QMULATE it is probably `true`, but "probably" is not a
      // licence. `saudiNationalWhereRequired` is NULL because it only bites for a foreign endower
      // holding real property, and the fixture does not say.
      islam: true,
      legalCapacity: true,
      noDisqualifyingRemoval: true,
      ksaResident: true,
      saudiNationalWhereRequired: null,
      authorityLicensed: null,
    },
  };
}

export interface AssetData {
  readonly waqfId: string;
  readonly type: string;
  readonly titleDeedNumber: string;
  readonly addressAr: string;
  readonly addressEn: string;
  readonly acquiredDate: Date;
  readonly acquiredDateHijri: HijriDateString;
  readonly valuationSar: string;
  readonly valuationDate: Date | null;
  readonly valuationDateHijri: HijriDateString | null;
  readonly status: AssetStatusValue;
}

export function mapAsset(asset: FixtureAsset): Mapped<AssetData> {
  const acquired = dual(asset.acquiredDate, `${asset.id}.acquiredDate`);
  return {
    id: asset.id,
    data: {
      waqfId: asset.waqfId,
      type: asset.type,
      titleDeedNumber: asset.titleDeedNumber,
      addressAr: mapValue(ADDRESS_AR, asset.address, 'asset address'), // [DERIVED] seed copy
      addressEn: asset.address,
      acquiredDate: acquired.gregorian,
      acquiredDateHijri: acquired.hijri,
      valuationSar: money(asset.valuationSar, `${asset.id}.valuationSar`),
      // [DERIVED] The fixture gives a valuation with no valuation DATE. Left null rather than
      // back-dated to the acquisition — a valuation's date drives revaluation and reclassification
      // deadlines, and inventing one would fabricate a compliance clock.
      valuationDate: null,
      valuationDateHijri: null,
      // [FIXTURE]+[MAPPED], and it used to be `[DERIVED] 'active'` for every row. Since migration 13
      // `asset.status` is the CLOSED enum `AssetStatus` (D-A), so the fixture may state an occupancy
      // — and a vocabulary no fixture row exercises is the R6-C1 shape all over again: a
      // configuration nothing can reach reports its silence as success. `status` is OPTIONAL in the
      // fixture and absent means `ACTIVE`, so no existing row had to be touched to say nothing new.
      status:
        asset.status === undefined
          ? 'ACTIVE'
          : mapValue(ASSET_STATUS, asset.status, 'asset status'),
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⊕ S11-1 — the SEEDED deadline: every RECORDED, COMPUTABLE registration anchor gets its row
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A fixture with a recorded clock-start and no computed deadline would leave the seeded board in a
 * state the UI can never produce (the procedure computes on record). So the seed computes too — and
 * it computes THROUGH THE ENGINE, over the seed's own holiday rows and its own `Setting` envelopes,
 * never from a hand-typed due date: a typed date in a fixture is a SECOND implementation of the
 * arithmetic, agreeing with the engine only until the engine changes (ADR-0007's single-
 * implementation rule, applied to a fixture). The snapshot shape is the domain's `windowSnapshotOf`
 * for the same reason.
 *
 * ⚠ AN ANCHOR OUTSIDE THE CALENDAR'S COVERAGE IS A STATE, NOT A DEFECT. waqf-007's 2015 documentation
 * date is the realistic shape of a real endowment's clock-start and lies outside the seeded 1447–1449
 * AH holidays; the engine refuses `CALENDAR_UNAVAILABLE`, correctly, and the seed writes NO row —
 * reporting it by name in the summary so "recorded, not computable" is a sentence in the output, not a
 * silence. Any OTHER refusal is fixture drift and stops the seed.
 */

export interface DeadlineData {
  readonly waqfId: string;
  readonly complianceTaskId: string | null;
  readonly ruleKey: 'REGISTER_30BD';
  readonly anchorDate: Date;
  readonly anchorDateHijri: HijriDateString;
  readonly dueDate: Date;
  readonly dueDateHijri: string;
  readonly actionableDate: Date | null;
  readonly actionableDateHijri: string | null;
  readonly windowSnapshot: Record<string, unknown>;
  readonly businessDaysUsed: number | null;
  readonly recomputedFromId: null;
  /** ⊕ S11-2 — the duty recorded as DISCHARGED (MET) on this date, or null while it stands open. */
  readonly satisfiedAt: Date | null;
  readonly satisfiedEvidenceId: null;
  /** `MET` exactly when `satisfiedAt` is set (migration 49 CHECKs, both directions). */
  readonly dischargeKind: 'MET' | null;
}

export interface RegistrationDeadlineDerivation {
  readonly rows: readonly Mapped<DeadlineData>[];
  /** One line per recorded anchor, computable or not — so the summary can say which is which. */
  readonly report: readonly string[];
}

export interface RegistrationDeadlineDeps {
  /** The seeded `calendar.workweek` envelope VALUE (global tier), as it is written to `setting`. */
  readonly workweekSetting: unknown;
  /** The seeded `deadline.REGISTER_30BD.businessDays` envelope VALUE (global tier). */
  readonly registerWindowSetting: unknown;
  /** The seeded holiday rows — the calendar's coverage is EXACTLY their span, never wider. */
  readonly holidays: readonly {
    readonly date: Date;
    readonly nameAr: string;
    readonly nameEn: string;
    readonly isWorkingDay: boolean;
  }[];
  /** The OPEN GOV-REG-01 task instance on an endowment, if the fixture has one, to bind the row to. */
  readonly openRegistrationTaskIdFor: (waqfId: string) => string | null;
}

function seedHolidayCalendar(deps: RegistrationDeadlineDeps): HolidayCalendar {
  const workweek = parseSetting('calendar.workweek', deps.workweekSetting);
  const observed: ObservedHoliday[] = deps.holidays
    .filter((row) => !row.isWorkingDay)
    .map((row) => ({
      date: civilDateFromUtcDate(row.date),
      nameAr: row.nameAr,
      nameEn: row.nameEn,
    }))
    .sort((a, b) =>
      String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0,
    );
  const first = observed[0]?.date;
  const last = observed[observed.length - 1]?.date;
  if (first === undefined || last === undefined) {
    throw new SeedRefusedError(
      'no seeded holidays — a business-day answer over an empty calendar is a guess.',
    );
  }
  // The same construction `packages/api`'s `assembleCalendar` makes from the stored rows, so the seed
  // and the router agree on what is computable.
  return buildHolidayCalendar({
    workweek: workweek.v,
    coverage: { from: String(first), to: String(last) },
    observed,
  });
}

export function deriveRegistrationDeadlines(
  fixture: Fixture,
  deps: RegistrationDeadlineDeps,
): RegistrationDeadlineDerivation {
  const calendar = seedHolidayCalendar(deps);
  const settings = {
    windowBusinessDays: parseSetting(
      'deadline.REGISTER_30BD.businessDays',
      deps.registerWindowSetting,
    ),
  };
  const rows: Mapped<DeadlineData>[] = [];
  const report: string[] = [];

  for (const waqf of fixture.waqfs) {
    if (waqf.registrationAnchor === null) continue;
    const anchor = dual(waqf.registrationAnchor.date, `${waqf.id}.registrationAnchor.date`); // [FIXTURE]+[DERIVED Hijri]
    const kind = mapValue(
      REGISTRATION_ANCHOR_KIND,
      waqf.registrationAnchor.kind,
      'registration anchor kind',
    );

    let computed;
    try {
      computed = computeRuleDeadline({
        ruleKey: 'REGISTER_30BD',
        anchor: civilDateFromUtcDate(anchor.gregorian),
        calendar,
        settings,
      });
    } catch (error) {
      if (error instanceof DomainError && error.code === 'CALENDAR_UNAVAILABLE') {
        report.push(
          `${waqf.id}: REGISTER_30BD anchor RECORDED (${waqf.registrationAnchor.date}, ${kind}) but NOT ` +
            'COMPUTABLE — outside the seeded holiday coverage (CALENDAR_UNAVAILABLE). No Deadline row.',
        );
        continue;
      }
      throw new SeedRefusedError(
        `fixture drift — ${waqf.id}'s registration anchor could not be computed for a reason other ` +
          `than calendar coverage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const taskId = deps.openRegistrationTaskIdFor(waqf.id);

    // ⊕ S11-2 — the fixture may record the duty as DISCHARGED (owner ruling f797fea: the red clears
    // because the duty was MET, never by editing the clock-start). The discharge is applied to the
    // computed row exactly as `deadline.dischargeRegistrationDuty` would write it: `satisfiedAt` +
    // `dischargeKind: MET`, the anchor untouched. A discharge dated before its own clock-start is
    // fixture drift and refuses the seed — the API refuses the same shape by name.
    const discharge = waqf.registrationAnchor.discharge;
    const dischargedAt = discharge === null ? null : new Date(`${discharge.on}T00:00:00.000Z`); // [FIXTURE]
    if (dischargedAt !== null && dischargedAt.getTime() < anchor.gregorian.getTime()) {
      throw new SeedRefusedError(
        `fixture drift — ${waqf.id}'s registration discharge (${discharge?.on ?? '?'}) precedes its ` +
          `clock-start (${waqf.registrationAnchor.date}); a duty cannot be met before its clock starts.`,
      );
    }
    rows.push({
      id: `deadline-register-30bd-${waqf.id}`,
      data: {
        waqfId: waqf.id,
        complianceTaskId: taskId,
        ruleKey: 'REGISTER_30BD',
        anchorDate: anchor.gregorian,
        anchorDateHijri: anchor.hijri,
        dueDate: new Date(`${computed.computed.due.gregorian}T00:00:00.000Z`),
        dueDateHijri: computed.computed.due.hijri,
        actionableDate:
          computed.actionable === null
            ? null
            : new Date(`${computed.actionable.gregorian}T00:00:00.000Z`),
        actionableDateHijri: computed.actionable?.hijri ?? null,
        windowSnapshot: windowSnapshotOf(computed, settings, {
          subject: 'waqf',
          sourceId: waqf.id,
          kind,
        }) as Record<string, unknown>,
        businessDaysUsed: computed.computed.window.businessDays ?? null,
        recomputedFromId: null,
        satisfiedAt: dischargedAt,
        satisfiedEvidenceId: null,
        dischargeKind: dischargedAt === null ? null : 'MET',
      },
    });
    report.push(
      `${waqf.id}: REGISTER_30BD anchor ${waqf.registrationAnchor.date} (${kind}) → due ` +
        `${computed.computed.due.gregorian} (${computed.computed.due.hijri} AH)` +
        (taskId === null
          ? ' — unbound (no open GOV-REG-01 task in the fixture)'
          : ` — bound to ${taskId}`) +
        (discharge === null
          ? ''
          : ` — DISCHARGED (MET) on ${discharge.on}` +
            (String(discharge.on) <= computed.computed.due.gregorian ? ', on time' : ', LATE')),
    );
  }

  return { rows, report };
}

/* ═════════════════════════════════════════════════
 * ⊕ S11 item 2a · the CERTIFICATE arm of UPDATE_15BD, seeded THROUGH THE ENGINE
 * ═════════════════════════════════════════════════ */

/** The row the seed writes for a raised update duty: the canonical GOV-REG-02 task it binds to. */
export interface EventTriggerTaskData {
  readonly waqfId: string;
  readonly obligationId: string;
  readonly templateCode: 'GOV-REG-02';
  readonly templateVersion: string;
  readonly confidentiality: string;
  readonly status: 'NOT_STARTED';
  readonly classificationAtInstantiation: WaqfClassificationValue;
  readonly instantiatedReason: 'EVENT_TRIGGER';
  readonly owner: null;
  readonly startDate: Date;
  readonly startDateHijri: HijriDateString;
  readonly closeDate: null;
  readonly closeDateHijri: null;
  readonly notes: null;
}

export interface UpdateDeadlineData {
  readonly waqfId: string;
  readonly complianceTaskId: string;
  readonly ruleKey: 'UPDATE_15BD';
  readonly anchorDate: Date;
  readonly anchorDateHijri: HijriDateString;
  readonly dueDate: Date;
  readonly dueDateHijri: string;
  readonly actionableDate: Date | null;
  readonly actionableDateHijri: string | null;
  readonly windowSnapshot: Record<string, unknown>;
  readonly businessDaysUsed: number | null;
  readonly recomputedFromId: null;
  readonly satisfiedAt: null;
  readonly satisfiedEvidenceId: null;
  readonly dischargeKind: null;
}

export interface CertificateUpdateDeps extends Pick<
  RegistrationDeadlineDeps,
  'workweekSetting' | 'holidays'
> {
  /** The seeded `deadline.UPDATE_15BD.businessDays` envelope VALUE (global tier). */
  readonly updateWindowSetting: unknown;
  /** The seeded `deadline.UPDATE_15BD.certificateExpiryLeadBd` envelope VALUE (global tier). */
  readonly leadSetting: unknown;
  /** The CANONICAL GOV-REG-02 obligation row (id + confidentiality), resolved AFTER the library is seeded. */
  readonly canonicalUpdateObligation: { readonly id: string; readonly confidentiality: string };
}

export interface CertificateUpdateDerivation {
  readonly tasks: readonly Mapped<EventTriggerTaskData>[];
  readonly deadlines: readonly Mapped<UpdateDeadlineData>[];
  readonly report: readonly string[];
}

/**
 * For every endowment whose fixture records that the daily sweep RAISED the update duty
 * (`certificate.updateDutyRaisedOn`), write what `deadline.sweepCertificateExpiry` would have written:
 * a canonical GOV-REG-02 task (EVENT_TRIGGER — the duty exists whatever the register's state, the
 * API's own declared reading) and a Deadline row computed THROUGH THE ENGINE from the expiry (the
 * anchor; `expiry + 15 business days`, never a hand-typed due date), bound to that task. The sweep's
 * in-scope rule is asserted, not assumed: a raise recorded EARLIER than `expiry − lead` is fixture
 * drift and refuses the seed. A certificate with no raise recorded gets NO row — a valid certificate
 * outside the lead is the honest "nothing due yet", and the board says so by cause, not by silence.
 */
export function deriveCertificateUpdateDeadlines(
  fixture: Fixture,
  deps: CertificateUpdateDeps,
): CertificateUpdateDerivation {
  const calendar = seedHolidayCalendar({
    workweekSetting: deps.workweekSetting,
    registerWindowSetting: null,
    holidays: deps.holidays,
    openRegistrationTaskIdFor: () => null,
  });
  const settings = {
    windowBusinessDays: parseSetting('deadline.UPDATE_15BD.businessDays', deps.updateWindowSetting),
  };
  const lead = parseSetting('deadline.UPDATE_15BD.certificateExpiryLeadBd', deps.leadSetting);
  const tasks: Mapped<EventTriggerTaskData>[] = [];
  const deadlines: Mapped<UpdateDeadlineData>[] = [];
  const report: string[] = [];

  for (const waqf of fixture.waqfs) {
    if (waqf.certificate === null) continue;
    const expiry = dual(waqf.certificate.expiry, `${waqf.id}.certificate.expiry`); // [FIXTURE]+[DERIVED Hijri]
    if (waqf.certificate.updateDutyRaisedOn === null) {
      report.push(
        `${waqf.id}: certificate expires ${waqf.certificate.expiry} — no update duty raised in the fixture ` +
          '(outside the lead, or the sweep has not noticed it): NO GOV-REG-02 row.',
      );
      continue;
    }
    const raisedOn = dual(
      waqf.certificate.updateDutyRaisedOn,
      `${waqf.id}.certificate.updateDutyRaisedOn`,
    );
    const expiryDay = civilDateFromUtcDate(expiry.gregorian);
    const raisedDay = civilDateFromUtcDate(raisedOn.gregorian);
    let noticeFrom;
    let computed;
    try {
      noticeFrom = addBusinessDays(expiryDay, -Number(lead.v), calendar);
      computed = computeRuleDeadline({
        ruleKey: 'UPDATE_15BD',
        anchor: expiryDay,
        calendar,
        settings,
      });
    } catch (error) {
      throw new SeedRefusedError(
        `fixture drift — ${waqf.id}'s certificate expiry ${waqf.certificate.expiry} cannot be computed ` +
          `through the engine: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (String(raisedDay) < String(noticeFrom)) {
      throw new SeedRefusedError(
        `fixture drift — ${waqf.id}'s update duty is recorded as raised on ${waqf.certificate.updateDutyRaisedOn}, ` +
          `BEFORE the sweep's notice boundary ${String(noticeFrom)} (expiry − ${String(lead.v)} business days). ` +
          'The sweep cannot have noticed a certificate it was not yet allowed to notice.',
      );
    }
    const taskId = `task-gov-reg-02-${waqf.id}`;
    tasks.push({
      id: taskId,
      data: {
        waqfId: waqf.id,
        obligationId: deps.canonicalUpdateObligation.id,
        templateCode: 'GOV-REG-02',
        templateVersion: OBLIGATION_LIBRARY_VERSION,
        confidentiality: deps.canonicalUpdateObligation.confidentiality,
        status: 'NOT_STARTED',
        classificationAtInstantiation: mapValue(
          CLASSIFICATION,
          waqf.classification,
          'waqf classification',
        ),
        instantiatedReason: 'EVENT_TRIGGER',
        owner: null,
        startDate: raisedOn.gregorian,
        startDateHijri: raisedOn.hijri,
        closeDate: null,
        closeDateHijri: null,
        notes: null,
      },
    });
    deadlines.push({
      id: `deadline-update-15bd-${waqf.id}`,
      data: {
        waqfId: waqf.id,
        complianceTaskId: taskId,
        ruleKey: 'UPDATE_15BD',
        anchorDate: expiry.gregorian,
        anchorDateHijri: expiry.hijri,
        dueDate: new Date(`${computed.computed.due.gregorian}T00:00:00.000Z`),
        dueDateHijri: computed.computed.due.hijri,
        actionableDate:
          computed.actionable === null
            ? null
            : new Date(`${computed.actionable.gregorian}T00:00:00.000Z`),
        actionableDateHijri: computed.actionable?.hijri ?? null,
        // The coalescing path's provenance is the governing CAUSE (certificate_expiry), exactly as
        // the API writes it: no declared anchor home, no anchor chain.
        windowSnapshot: windowSnapshotOf(computed, settings, null) as Record<string, unknown>,
        businessDaysUsed: computed.computed.window.businessDays ?? null,
        recomputedFromId: null,
        satisfiedAt: null,
        satisfiedEvidenceId: null,
        dischargeKind: null,
      },
    });
    report.push(
      `${waqf.id}: certificate expired ${waqf.certificate.expiry} → GOV-REG-02 raised ${waqf.certificate.updateDutyRaisedOn} ` +
        `(notice boundary ${String(noticeFrom)}) → UPDATE_15BD due ${computed.computed.due.gregorian} ` +
        `(${computed.computed.due.hijri} AH) — bound to ${taskId}`,
    );
  }

  return { tasks, deadlines, report };
}

export interface ExpropriationData {
  readonly assetId: string;
  readonly waqfId: string;
  readonly authorityAr: string;
  readonly scope: string;
  readonly announcedDate: Date;
  readonly announcedDateHijri: HijriDateString;
  readonly compensationSar: string | null;
  readonly compensationStatus: string;
  readonly istibdalStatus: string;
  readonly replacementAssetId: string | null;
  readonly authorityNotifiedDate: Date | null;
  readonly authorityNotifiedDateHijri: HijriDateString | null;
  /** ⊕ S11-1 — the istibdal COMPLETION date (migration 48), `ISTIBDAL_10BD`'s anchor. Dual or both null. */
  readonly istibdalCompletedDate: Date | null;
  readonly istibdalCompletedDateHijri: HijriDateString | null;
}

/**
 * BINDING RULE 1: expropriation compensation and any istibdal proceeds are CORPUS (aṣl), not
 * income. When such a receipt is eventually banked it must be entered as
 * `receiptClass = CAPITAL, capitalSource = EXPROPRIATION_COMPENSATION | ISTIBDAL_PROCEEDS`, which
 * the DB CHECKs enforce and which the distribution waterfall's index excludes by construction.
 * The fixture's compensation is only ASSESSED, not received, so no such Transaction is seeded.
 *
 * The 10-business-day Authority-notice window is NOT stored on this row: it resolves from
 * `Setting['deadline.ISTIBDAL_10BD.businessDays']` (⚠ unverified — confirm vs primary law).
 */
export function mapExpropriation(expropriation: FixtureExpropriation): Mapped<ExpropriationData> {
  const announced = dual(expropriation.announcedDate, `${expropriation.id}.announcedDate`);
  const notified = dualOrNull(
    expropriation.istibdal.authorityNotifiedDate,
    `${expropriation.id}.istibdal.authorityNotifiedDate`,
  );
  // ⊕ S11-1 — [FIXTURE] + [DERIVED Hijri]. Never derived from `announcedDate` or the DISCHARGE.
  const completed = dualOrNull(
    expropriation.istibdal.completedDate,
    `${expropriation.id}.istibdal.completedDate`,
  );
  return {
    id: expropriation.id,
    data: {
      assetId: expropriation.assetId,
      waqfId: expropriation.waqfId,
      authorityAr: mapValue(AUTHORITY_AR, expropriation.authority, 'expropriating authority'), // [DERIVED]
      scope: expropriation.scope,
      announcedDate: announced.gregorian,
      announcedDateHijri: announced.hijri,
      compensationSar:
        expropriation.compensationSar === null
          ? null
          : money(expropriation.compensationSar, `${expropriation.id}.compensationSar`),
      compensationStatus: expropriation.compensationStatus,
      istibdalStatus: expropriation.istibdal.status,
      replacementAssetId: expropriation.istibdal.replacementAssetId,
      authorityNotifiedDate: notified.gregorian,
      authorityNotifiedDateHijri: notified.hijri,
      istibdalCompletedDate: completed.gregorian,
      istibdalCompletedDateHijri: completed.hijri,
    },
  };
}

export interface BeneficiaryData {
  readonly waqfId: string;
  readonly branch: string;
  readonly relationshipAr: string;
  readonly relationshipEn: string;
  readonly kind: BeneficiaryKindValue;
  readonly residency: BeneficiaryResidencyValue;
  readonly categoryDescriptionAr: string | null;
  readonly tabaqa: number | null;
  readonly line: BeneficiaryLineValue;
  /** `null` = A CHILD OF THE WAQIF, never "unknown". See the schema comment on the column. */
  readonly parentId: string | null;
  /** ⚠ The ẓuhūr/buṭūn eligibility fact — never rendered as a person's gender. */
  readonly lineageLink: LineageLinkValue | null;
  readonly active: boolean;
  readonly deceasedAt: Date | null;
  readonly deceasedAtHijri: HijriDateString | null;
  readonly sharePercent: string | null;
  /** The DEED weight, distinct from `sharePercent`. Scale 18 — a weight is not money. */
  readonly stipulatedWeight: string | null;
  readonly verificationStatus: VerificationStatusValue;
  readonly kycLastRefreshed: Date | null;
  readonly kycLastRefreshedHijri: HijriDateString | null;
  readonly isUbo: boolean;
  /** PLAINTEXT at this boundary — the encryption extension encrypts it and derives the HMAC. */
  readonly uboIdTypeEnc: string | null;
  readonly uboIdNumberEnc: string | null;
  readonly uboBankingRefEnc: string | null;
  readonly uboShareOfProceeds: string | null;
  readonly confidentiality: ConfidentialityValue;
}

/**
 * NOTE the deliberate absences:
 *   • `...Hmac` columns are NEVER set here. The encryption extension derives them and THROWS if a
 *     caller supplies one.
 *   • There is no name field in the schema, and none is invented.
 *   • `categoryDescriptionAr` is MAPPED FROM FIXTURE DATA since S5/E4 (`beneficiary.category`) —
 *     null on every current record, deliberately: ben-009's null is the CATEGORY_NOT_CAPTURED
 *     gate's subject, and capturing a category is E4's staff write path, exercised against
 *     created records rather than spent on a seeded one (the V-E3-04 lesson).
 *   • `disbursingEntity` and the top-level `bankingRefForProceeds` are VALIDATED FIXTURE DATA
 *     WITH NO COLUMN — E5/E6 owes each a home (the banking ref an encrypted `...Enc`/`...Hmac`
 *     pair on the UBO precedent). They are deliberately not smuggled into an existing column.
 *
 * TODO(surface): SCOPE/LEGAL — BR-206 requires a category description before any disbursement to a
 * beneficiary who is not individually identified. ben-006 is a CHARITABLE_JIHA whose purpose the
 * fixture never names, so it is seeded null and a distribution run touching waqf-003 will
 * correctly block on it. Confirm this is the intended behaviour rather than seeding a placeholder
 * purpose that would mask the gap.
 */
export function mapBeneficiary(beneficiary: FixtureBeneficiary): Mapped<BeneficiaryData> {
  const relationship = mapValue(RELATIONSHIP, beneficiary.relationship, 'beneficiary relationship');
  const kyc = dualOrNull(beneficiary.kycLastRefreshed, `${beneficiary.id}.kycLastRefreshed`);
  const deceased = dualOrNull(beneficiary.deceasedDate, `${beneficiary.id}.deceasedDate`);
  const ubo = beneficiary.ubo;
  const kind = mapValue(BENEFICIARY_KIND, beneficiary.kind, 'beneficiary kind'); // [MAPPED]
  const lineageLink =
    beneficiary.lineageLink === null
      ? null
      : mapValue(LINEAGE_LINK, beneficiary.lineageLink, 'beneficiary lineageLink'); // [MAPPED]

  // ── THE COHERENCE REFUSALS (R6 / R-FRONTIER / ADR-0009) ─────────────────────────────────────
  // Each of these mirrors an ENGINE refusal, at the seed boundary, so an incoherent fixture is
  // rejected with a readable message before a row is written. None of them invents a rule: they are
  // the mechanical consequences of the owner's R6 ruling and of what `null` means on each column.
  //
  // ⚠ WHAT IS NOT CHECKED HERE, ON PURPOSE: whether a ذري cohort may hold a charitable jiha, and
  // whether a خيري cohort may hold a descendant. Those are register item #13's OPEN questions —
  // R7 answered only the ultimate-taker case, and the two خيري mirrors are Claude's own reading of
  // R5 awaiting the owner. The engine refuses them where they can be revised without a migration
  // and without re-seeding; the seed does not duplicate that judgement.
  if (relationship.expectedKind !== null && relationship.expectedKind !== kind) {
    throw new SeedRefusedError(
      `fixture drift — ${beneficiary.id} is kind "${beneficiary.kind}" but its relationship ` +
        `"${beneficiary.relationship}" implies ${relationship.expectedKind}. The kind is data and ` +
        'the prose is copy; when they disagree the seed refuses rather than preferring one.',
    );
  }
  if (kind === 'CHARITABLE_JIHA' && (lineageLink !== null || beneficiary.parentId !== null)) {
    throw new SeedRefusedError(
      `fixture drift — ${beneficiary.id} is a CHARITABLE_JIHA carrying a lineage edge. A jiha is ` +
        'not a descendant of the waqif, so it carries neither a parentId nor a lineageLink (the ' +
        'engine refuses this as LINEAGE_EDGE_ON_NON_DESCENDANT). That is true of a recorded ' +
        'ultimate taker too — مآل الوقف names a destination, not a bloodline.',
    );
  }
  if (kind !== 'CHARITABLE_JIHA' && lineageLink === null) {
    throw new SeedRefusedError(
      `fixture drift — ${beneficiary.id} is a ${kind} beneficiary with no lineageLink. ⚠ R6 ` +
        '(product owner, 2026-08-03): eligibility comes from DESCENT, so the descent must be on ' +
        'record whatever order the deed uses — the engine halts SHART_INCOMPLETE / ' +
        'LINEAGE_LINK_MISSING on ORDERED and SHARED too, and will not pay someone it cannot place ' +
        'in the family tree. Measured before R6 landed: an unplaceable member took 78,000,000 of ' +
        '78,000,000 halalas with no flag raised.',
    );
  }
  if (beneficiary.active && beneficiary.deceasedDate !== null) {
    throw new SeedRefusedError(
      `fixture drift — ${beneficiary.id} is active: true and carries a deceasedDate. CHECK ` +
        'beneficiary_active_not_deceased refuses the same row at the database.',
    );
  }

  return {
    id: beneficiary.id,
    data: {
      waqfId: beneficiary.waqfId,
      branch: beneficiary.branch,
      relationshipAr: relationship.ar, // [DERIVED] seed copy
      relationshipEn: relationship.en, // [FIXTURE]
      kind, // [MAPPED] from fixture DATA since S4 — no longer inferred from the prose
      // [MAPPED] from fixture DATA since S5/E4 — the hardcoded 'DOMESTIC' is gone. ⚠ That
      // hardcode was recorded as "[DERIVED], the conservative default"; it was also the reason
      // no seeded record could exercise BR-511's cross-border path at all.
      residency: mapValue(BENEFICIARY_RESIDENCY, beneficiary.residency, 'beneficiary residency'),
      // [FIXTURE] since S5/E4. Null on every current record — see the doc comment above.
      categoryDescriptionAr: beneficiary.category,
      tabaqa: beneficiary.tabaqa,
      line: mapValue(BENEFICIARY_LINE, beneficiary.line, 'beneficiary line'), // [MAPPED]
      // [FIXTURE] `null` = a child of the waqif. The composite FK confines the edge to this
      // endowment; `assertFixtureReferences` additionally requires the parent to appear EARLIER in
      // the fixture array, because the FK is checked at INSERT rather than at COMMIT.
      parentId: beneficiary.parentId,
      lineageLink,
      // [FIXTURE] NEVER DEFAULTED. An ancestor's value decides a whole branch's entitlement
      // (R-FRONTIER), so a defaulted vital status silently moves money.
      active: beneficiary.active,
      deceasedAt: deceased.gregorian,
      deceasedAtHijri: deceased.hijri,
      // Relative roster weight, not the deed's absolute allocation (see fixture defect F2).
      sharePercent:
        beneficiary.sharePercent === null ? null : new Decimal(beneficiary.sharePercent).toFixed(4),
      // [FIXTURE] The DEED weight, kept as a string end to end. ⚠ A DIFFERENT FIELD FROM
      // `sharePercent`: waqf-001's three 12.5s sum to 37.5, and §08 renormalises a deed weight over
      // the ENTITLED cohort. Nullable, and NOT substituted when absent — the mapper passes the null
      // through so the engine can refuse it, rather than inventing an allocation.
      stipulatedWeight:
        beneficiary.stipulatedWeight === null
          ? null
          : new Decimal(beneficiary.stipulatedWeight).toFixed(18),
      verificationStatus: mapValue(
        VERIFICATION_STATUS,
        beneficiary.verificationStatus,
        'beneficiary verificationStatus',
      ),
      kycLastRefreshed: kyc.gregorian,
      kycLastRefreshedHijri: kyc.hijri,
      isUbo: ubo.isUbo,
      uboIdTypeEnc: ubo.isUbo ? ubo.idType : null,
      uboIdNumberEnc: ubo.isUbo ? ubo.idNumber : null,
      uboBankingRefEnc: ubo.isUbo ? ubo.bankingRefForProceeds : null,
      uboShareOfProceeds: ubo.isUbo ? new Decimal(ubo.shareOfProceedsPercent).toFixed(4) : null,
      // Every beneficiary row carries the UBO minimum dataset's sensitivity, UBO or not.
      confidentiality: 'SENSITIVE_PII',
    },
  };
}

export interface BankAccountData {
  readonly waqfId: string;
  readonly accountRef: string;
  /** PLAINTEXT at this boundary; ciphertext at rest. `ibanHmac` is derived, never supplied. */
  readonly ibanEnc: string;
  readonly bankNameAr: string;
  readonly purpose: string;
  readonly currency: string;
  readonly isDedicated: boolean;
}

/**
 * [DERIVED] The fixture references bank accounts only as opaque strings on each transaction
 * (`"FAKE-ACCT-W1"`). BR-501 requires a dedicated, non-commingled account per endowment, so one
 * `BankAccount` row is derived per distinct reference.
 *
 * The IBAN is derived from the same reference (`FAKE-ACCT-W1` → `FAKE-IBAN-W1`) so it stays inside
 * the fixture's `FAKE-*` convention and can never be mistaken for a real IBAN.
 *
 * Commingling is checked here rather than assumed: if one account reference ever appears under two
 * endowments the seed refuses, because that is precisely the zero-tolerance condition BR-501 exists
 * to prevent.
 */
export function deriveBankAccounts(fixture: Fixture): ReadonlyArray<Mapped<BankAccountData>> {
  const waqfByRef = new Map<string, string>();
  const ordered: string[] = [];
  const rows = [
    ...fixture.financialTransactions.revenue,
    ...fixture.financialTransactions.expenses,
    // ⊕ S12-3 · accounts OPENED but not yet used (Gate 02's dedicated account, before any activity).
    // Same commingling rule: one endowment per account reference, refused otherwise.
    ...fixture.bankAccounts.map((account) => ({
      bankAccount: account.ref,
      waqfId: account.waqfId,
    })),
  ];
  for (const row of rows) {
    const existing = waqfByRef.get(row.bankAccount);
    if (existing === undefined) {
      waqfByRef.set(row.bankAccount, row.waqfId);
      ordered.push(row.bankAccount);
    } else if (existing !== row.waqfId) {
      throw new SeedRefusedError(
        `fixture drift — bank account ${JSON.stringify(row.bankAccount)} is used by both ` +
          `${existing} and ${row.waqfId}. Commingling endowment funds is prohibited (BR-501).`,
      );
    }
  }
  return ordered.map((accountRef) => {
    const iban = accountRef.replace('-ACCT-', '-IBAN-');
    if (!iban.startsWith('FAKE-')) {
      throw new SeedRefusedError(
        `non-fixture identifier detected: derived IBAN ${JSON.stringify(iban)} is not FAKE-prefixed`,
      );
    }
    return {
      id: derivedId.bankAccount(accountRef),
      data: {
        waqfId: waqfByRef.get(accountRef) as string,
        accountRef, // [FIXTURE] plaintext human label
        ibanEnc: iban, // [DERIVED] plaintext in, ciphertext at rest
        bankNameAr: BANK_NAME_AR, // [DERIVED] seed copy
        purpose: 'ghallah_operating', // [DERIVED]
        currency: 'SAR',
        isDedicated: true, // BR-501: dedicated per endowment, no commingling
      },
    };
  });
}

export interface TransactionData {
  readonly waqfId: string;
  readonly type: TxnTypeValue;
  readonly category: string;
  readonly expenseCategory: ExpenseCategoryValue | null;
  readonly receiptClass: ReceiptClassValue | null;
  readonly capitalSource: CapitalSourceValue | null;
  readonly capitalSourceNoteAr: string | null;
  readonly descriptionAr: string;
  readonly descriptionEn: string;
  readonly amountSar: string;
  readonly date: Date;
  readonly dateHijri: HijriDateString;
  readonly bankAccountId: string;
  readonly assetId: string | null;
  /**
   * The bank's own reference — the reconciliation's ONLY matching key (migration 20 §1).
   *
   * ⚠ Seeded on every movement, and that is load-bearing rather than decorative: with no
   * reference every entry reconciles as `UNREFERENCED`, so a suite asserting "the run reports a
   * mismatch" would pass over an engine structurally incapable of matching anything.
   */
  readonly bankReference: string | null;
  readonly reconciledAt: Date | null;
}

/**
 * ┌─ BINDING RULE 1 — CORPUS / INCOME SEGREGATION ─────────────────────────────────────────┐
 * │ Corpus (aṣl / أصل) and income (ghallah / غلة) are distinct and are never mixed. EVERY    │
 * │ receipt is classified at entry. Only `type = REVENUE AND receiptClass = INCOME` may ever │
 * │ enter the distribution waterfall; CAPITAL receipts — sale proceeds, istibdal proceeds,   │
 * │ expropriation compensation — are corpus and are blocked from distribution.               │
 * │                                                                                          │
 * │ ⚠ SINCE S4/E3 THE CLASSIFICATION IS **DATA IN THE FIXTURE**, NOT A DECISION HERE. This    │
 * │ function used to write `receiptClass: 'INCOME'` unconditionally, on the argument that both │
 * │ fixture rows happen to be rent. That argument is true of today's fixture and is the wrong │
 * │ place to make it: a capital receipt added to the JSON would have been classified INCOME by │
 * │ the MAPPER and would have entered the distribution waterfall, which Binding rule 1 forbids │
 * │ absolutely. Every revenue row now carries its own `receiptClass`, and an unmapped value    │
 * │ REFUSES the seed rather than defaulting.                                                  │
 * │                                                                                          │
 * │ A `CAPITAL` row must also name its `capitalSource`, and an `INCOME` row must not — the DB  │
 * │ CHECKs say the same independently, and this refuses earlier with a readable message.       │
 * │                                                                                          │
 * │ ⊕ THE RULING STATUS MOVED ON 2026-08-18 AND THIS COMMENT WAS STALE. It said "the Sharia │
 * │ review is UNSIGNED, treat the rules as open". CLAUDE.md register item #8 now records the │
 * │ review as ANSWERED and ATTRIBUTED — written by a licensed lawyer with endowment         │
 * │ expertise and DESIGNATED authoritative by the product owner, pending formal signature.  │
 * │ Q6(a)–(e) ARE RULED: rent = income · sale proceeds = capital · ISTIBDAL PROCEEDS =       │
 * │ CAPITAL · expropriation compensation = usually capital · non-diminution absolute. So the │
 * │ three source values this fixture actually uses (`rent`, `expropriation_compensation`,    │
 * │ `istibdal_proceeds` — rev-005, S7) each stand on a ruling, not on this seed's judgement. │
 * │ ⚠ FORMAL SIGNATURE IS STILL OWED, and real client data may not pass here before it.     │
 * │                                                                                          │
 * │ TODO(surface): FIQH — FOUR EDGE RECEIPT TYPES REMAIN UNRULED, and CLAUDE.md is explicit  │
 * │ that they get NO fixture subject and NO chart-of-accounts entry, because every REVENUE   │
 * │ row must carry a class at entry and recording one IS answering it — the ruling precedes  │
 * │ the record. They are: lease premium / key money; insurance proceeds on a destroyed       │
 * │ building; rent arrears collected after an istibdal (old corpus or new?); and whether a   │
 * │ ṣiyāna reserve funded out of income becomes corpus once accumulated. All four were added │
 * │ to the brief AFTER the answered copy was written, so no review of that date reached them.│
 * │ Still open on top: whether a CAPITAL receipt belongs in `Transaction` at all rather than │
 * │ a separate `CorpusMovement` entity, and Q3 (ṣiyāna when the deed is silent), whose       │
 * │ reported answer DISAGREES with shipped behaviour and is a reconciliation owed.           │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function mapRevenue(revenue: FixtureRevenue): Mapped<TransactionData> {
  const copy = mapValue(REVENUE_COPY, revenue.source, 'revenue source');
  const when = dual(revenue.date, `${revenue.id}.date`);
  const receiptClass = mapValue(RECEIPT_CLASS, revenue.receiptClass, 'revenue receiptClass');
  const capitalSource =
    revenue.capitalSource === null
      ? null
      : mapValue(CAPITAL_SOURCE, revenue.capitalSource, 'revenue capitalSource');

  if (receiptClass === 'CAPITAL' && capitalSource === null) {
    throw new SeedRefusedError(
      `fixture drift — ${revenue.id} is receiptClass "capital" with no capitalSource. A capital ` +
        'receipt is CORPUS (aṣl) and must say which corpus event produced it: sale proceeds, ' +
        'istibdal proceeds or expropriation compensation. The DB CHECK on `transaction` refuses ' +
        'the same row (Binding rule 1).',
    );
  }
  if (receiptClass === 'INCOME' && capitalSource !== null) {
    throw new SeedRefusedError(
      `fixture drift — ${revenue.id} is receiptClass "income" but names a capitalSource ` +
        `("${String(revenue.capitalSource)}"). Income (ghallah) has no corpus source. A row that ` +
        'claims both is the corpus/income boundary being blurred in the one place it may not be.',
    );
  }

  return {
    id: revenue.id,
    data: {
      waqfId: revenue.waqfId,
      type: 'REVENUE',
      // TODO(surface): SCOPE — the SOCPA-aligned chart of accounts (with explicit corpus/income
      // account classes, per the ledger ADR) is not built until E5/S6. Until then this column
      // carries the fixture's raw source string, NOT a COA code.
      category: revenue.source,
      expenseCategory: null,
      receiptClass, // [MAPPED] from fixture DATA since S4 — see the block comment above
      capitalSource, // [MAPPED]
      capitalSourceNoteAr: null,
      descriptionAr: copy.ar, // [DERIVED] seed copy, Arabic-authoritative
      descriptionEn: copy.en,
      amountSar: money(revenue.amountSar, `${revenue.id}.amountSar`),
      date: when.gregorian,
      dateHijri: when.hijri,
      bankAccountId: derivedId.bankAccount(revenue.bankAccount),
      assetId: revenue.assetId ?? null,
      // [DERIVED] The bank's reference. A FUNCTION of the row id — no random, no clock — so a
      // fresh migrate + seed reproduces byte-identical rows and therefore a byte-identical audit
      // hash chain. Without it every seeded entry reconciles as UNREFERENCED and a reconciliation
      // suite would pass over an engine structurally incapable of matching anything.
      bankReference: derivedId.bankReference(revenue.id),
      // [DERIVED] Reconciliation is an E5 workflow; nothing in the fixture evidences one.
      reconciledAt: null,
    },
  };
}

export function mapExpense(expense: FixtureExpense): Mapped<TransactionData> {
  const copy = mapValue(EXPENSE_COPY, expense.category, 'expense category copy');
  const when = dual(expense.date, `${expense.id}.date`);
  return {
    id: expense.id,
    data: {
      waqfId: expense.waqfId,
      type: 'EXPENSE',
      category: expense.category, // see the COA TODO(surface) above
      expenseCategory: mapValue(EXPENSE_CATEGORY, expense.category, 'expense category'), // [MAPPED]
      // An EXPENSE is an outflow: it is neither ghallah nor an aṣl inflow, so it carries NO
      // receipt classification at all. The DB CHECK `transaction_expense_has_no_receipt_class`
      // enforces this independently of the application.
      receiptClass: null,
      capitalSource: null,
      capitalSourceNoteAr: null,
      descriptionAr: copy.ar,
      descriptionEn: expense.note === undefined ? copy.en : `${copy.en} — ${expense.note}`,
      amountSar: money(expense.amountSar, `${expense.id}.amountSar`),
      date: when.gregorian,
      dateHijri: when.hijri,
      bankAccountId: derivedId.bankAccount(expense.bankAccount),
      assetId: expense.assetId ?? null,
      bankReference: derivedId.bankReference(expense.id),
      reconciledAt: null,
    },
  };
}

export interface NazirFeeData {
  readonly waqfId: string;
  readonly basis: FeeBasisValue;
  readonly percent: string | null;
  readonly amountSar: string;
  readonly periodEnd: Date;
  readonly periodEndHijri: HijriDateString;
  readonly deductedBeforeDistribution: boolean;
  readonly invoiceRef: string | null;
  readonly sourceNote: string;
}

/**
 * ⚠ unverified — confirm vs primary law.
 *
 * This is the DEED-SET trustee fee (customary ʿushr, 10% of revenue). It is NOT the Awqaf Law
 * Art. 14 ≤10%-of-net-income fee, which belongs to the Authority and is seeded separately as
 * `Setting['authorityFee.maxPercentOfNetIncome']`.
 *
 * Fixture defect F8: the same 35,000 appears twice — once as this fee record and once as the
 * cash movement `exp-e-002`. Both are seeded deliberately (the record is the entitlement, the
 * transaction is the payment), so any reconciliation routine must avoid double-counting them.
 */
export function mapNazirFee(fee: FixtureNazirFee): Mapped<NazirFeeData> {
  const periodEnd = dual(fee.periodEnd, `${fee.id}.periodEnd`);
  return {
    id: fee.id,
    data: {
      waqfId: fee.waqfId,
      basis: mapValue(FEE_BASIS, fee.basis, 'nazir fee basis'), // [MAPPED]
      percent: fee.percent === null ? null : new Decimal(fee.percent).toFixed(3),
      amountSar: money(fee.amountSar, `${fee.id}.amountSar`),
      periodEnd: periodEnd.gregorian,
      periodEndHijri: periodEnd.hijri,
      deductedBeforeDistribution: fee.deductedBeforeDistribution,
      invoiceRef: fee.invoiceRef,
      sourceNote: fee.source, // [FIXTURE] "waqf_deed (customary ushr) — not a regulatory rate"
    },
  };
}

export interface DistributionData {
  readonly waqfId: string;
  readonly periodStart: Date;
  readonly periodStartHijri: HijriDateString;
  readonly periodEnd: Date;
  readonly periodEndHijri: HijriDateString;
  readonly grossRevenueSar: string;
  readonly reserveSar: string;
  readonly operatingSar: string;
  readonly nazirFeeSar: string;
  readonly distributableSar: string;
  readonly status: DistributionStatusValue;
  readonly approvalRequestId: string | null;
  readonly executedAt: Date | null;
  readonly executedAtHijri: HijriDateString | null;
  readonly computationTrace: Record<string, unknown>;
}

export interface DistributionLineItemData {
  /**
   * ⚠ E5 (migration 19 §2). The line's OWN endowment, tied by composite FK to BOTH the parent run
   * and the paid beneficiary — so a run of one endowment paying another endowment's beneficiary is
   * unrepresentable rather than merely unusual. Measured before the guard: that exact row committed.
   * DERIVED from the parent run here, never taken from the fixture and never defaulted.
   */
  readonly waqfId: string;
  readonly distributionId: string;
  readonly beneficiaryId: string;
  readonly status: DistributionLineStatusValue;
  readonly sharePercent: string;
  readonly amountSar: string;
  readonly transferRef: string | null;
  readonly blockedReason: string | null;
}

/**
 * [DERIVED] The fixture's distribution carries only a `totalSar`; the schema needs the full
 * waterfall. It is DERIVED FROM THE LEDGER by four stated rules, not hand-entered:
 *
 *   grossRevenue = Σ REVENUE transactions for this endowment dated within the period
 *   reserve      = Σ MAINTENANCE expenses within the period   (ṣiyāna, reserved FIRST)
 *   operating    = Σ OPERATIONS expenses within the period
 *   nazirFee     = Σ NazirFee RECORDS whose periodEnd equals this period's end
 *                  (the fee RECORD, not the cash movement — avoids the F8 double-count, and the
 *                   payment itself falls outside the period anyway)
 *   distributable = gross − reserve − operating − nazirFee
 *
 * Strict waterfall order (ṣiyāna → operating → Nazir fee → distributable) and Binding rule 1
 * (income only) are both respected: only REVENUE rows feed `grossRevenue`, and every fixture
 * revenue row is `receiptClass = INCOME`.
 *
 * THE FIXTURE'S OWN NUMBERS DISAGREE WITH THIS, THREE WAYS (defect F1). The discrepancy is
 * RECORDED IN `computationTrace`, not silently repaired: this row is seeded as a HISTORICAL
 * RECORD, not as an engine output, and no DB conservation CHECK is added (one would make the
 * fixture unseedable). The line items are seeded VERBATIM from the fixture for the same reason.
 */
export function mapDistribution(
  distribution: FixtureDistribution,
  fixture: Fixture,
): {
  readonly distribution: Mapped<DistributionData>;
  readonly lineItems: ReadonlyArray<Mapped<DistributionLineItemData>>;
} {
  const periodStart = dual(distribution.periodStart, `${distribution.id}.periodStart`);
  const periodEnd = dual(distribution.periodEnd, `${distribution.id}.periodEnd`);
  const executed = dualOrNull(distribution.closeDate, `${distribution.id}.closeDate`);

  const inPeriod = (date: string): boolean =>
    date >= distribution.periodStart && date <= distribution.periodEnd; // ISO dates sort lexically

  // ⚠ `receiptClass === 'income'` IS LOAD-BEARING, NOT DECORATIVE (Binding rule 1). Before S4 the
  // classification was hardcoded in `mapRevenue`, so this filter had nothing to do and the comment
  // below said so. Now that it is fixture DATA, a CAPITAL receipt added to the JSON must be EXCLUDED
  // from the distributable rather than swept into it: corpus is never distributed, and sale /
  // istibdal / expropriation proceeds are corpus. Without this clause, adding one capital row to the
  // fixture would distribute it.
  const grossRevenueSar = sumMoney(
    fixture.financialTransactions.revenue
      .filter(
        (r) => r.waqfId === distribution.waqfId && inPeriod(r.date) && r.receiptClass === 'income',
      )
      .map((r) => money(r.amountSar, `${r.id}.amountSar`)),
  );
  const expensesOfCategory = (category: string): string =>
    sumMoney(
      fixture.financialTransactions.expenses
        .filter(
          (e) => e.waqfId === distribution.waqfId && e.category === category && inPeriod(e.date),
        )
        .map((e) => money(e.amountSar, `${e.id}.amountSar`)),
    );
  const reserveSar = expensesOfCategory('maintenance');
  const operatingSar = expensesOfCategory('operations');
  const nazirFeeSar = sumMoney(
    fixture.nazirFees
      .filter((f) => f.waqfId === distribution.waqfId && f.periodEnd === distribution.periodEnd)
      .map((f) => money(f.amountSar, `${f.id}.amountSar`)),
  );
  const distributableSar = subtractMoney(grossRevenueSar, [reserveSar, operatingSar, nazirFeeSar]);

  const fixtureTotalSar = money(distribution.totalSar, `${distribution.id}.totalSar`);

  return {
    distribution: {
      id: distribution.id,
      data: {
        waqfId: distribution.waqfId,
        periodStart: periodStart.gregorian,
        periodStartHijri: periodStart.hijri,
        periodEnd: periodEnd.gregorian,
        periodEndHijri: periodEnd.hijri,
        grossRevenueSar,
        reserveSar,
        operatingSar,
        nazirFeeSar,
        distributableSar,
        status: mapValue(DISTRIBUTION_STATUS, distribution.status, 'distribution status'), // [MAPPED]
        // [DERIVED] E2 makes `APPROVED`/`EXECUTED` with a NULL approval UNREPRESENTABLE (CHECK
        // `distribution_approved_requires_approval_request`), because zero authority is worse than
        // a second authority: nothing to attribute, nothing to audit, and the maker-checker
        // invariant vacuously satisfied. A run that has NOT reached those states legitimately has
        // no approval yet, so it stays null. See `deriveRunApprovals` for the row this points at.
        approvalRequestId: REQUIRES_APPROVAL_STATUSES.has(
          mapValue(DISTRIBUTION_STATUS, distribution.status, 'distribution status'),
        )
          ? derivedId.runApproval(distribution.id)
          : null,
        executedAt: executed.gregorian,
        executedAtHijri: executed.hijri,
        computationTrace: {
          origin: 'fixture-historical',
          note:
            'Seeded as a HISTORICAL RECORD, not an engine computation. The fixture is internally ' +
            'inconsistent three ways: (a) its totalSar of 279000.00 disagrees with the waterfall ' +
            'derived from its own ledger; (b) its line items are 12.5% of that total rather than ' +
            'a renormalized share of the distributable amount; (c) it pays ben-002, who is ' +
            'tabaqa 2 in an ORDERED waqf while tabaqa 1 is still alive, which the distribution ' +
            'engine invariant on ordered exclusion forbids. Not silently repaired — the ' +
            'discrepancy is a decision for Product/Sharia review, and no DB conservation CHECK ' +
            'was added because it would make this fixture unseedable.',
          fixtureTotalSar,
          derivation: {
            grossRevenueSar,
            reserveSar,
            operatingSar,
            nazirFeeSar,
            distributableSar,
            rules: [
              'grossRevenue = sum(REVENUE transactions, receiptClass=INCOME, date within period)',
              'reserve = sum(MAINTENANCE expenses within period) — siyana reserved first',
              'operating = sum(OPERATIONS expenses within period)',
              'nazirFee = sum(NazirFee records whose periodEnd equals this period end)',
              'distributable = gross - reserve - operating - nazirFee',
            ],
            caveats: [
              'The fixture stipulates NO maintenance reserve rule for any endowment; the reserve ' +
                'above is an already-paid maintenance EXPENSE standing in for one. An expense is ' +
                'not a stipulated reserve — the Shart records maintenanceReserve as "unspecified".',
              'The Nazir fee is the deed-set ushr (10% of revenue), unverified against primary law.',
            ],
          },
        },
      },
    },
    lineItems: distribution.lineItems.map((lineItem) => ({
      id: derivedId.distributionLineItem(distribution.id, lineItem.beneficiaryId), // [DERIVED]
      data: {
        // [DERIVED] from the PARENT RUN, which is what the composite FK asserts. Reading it from
        // the beneficiary instead would make the pair agree with each other while disagreeing with
        // the run that is paying — the exact state migration 19 §3's second FK exists to refuse.
        waqfId: distribution.waqfId,
        distributionId: distribution.id,
        beneficiaryId: lineItem.beneficiaryId,
        // [DERIVED] The parent run is EXECUTED and each line carries a transfer reference, so each
        // line is PAID. Seeded verbatim — see defect F1(c): one of these lines should arguably
        // never have been paid, and that is exactly what must stay visible.
        status: 'PAID',
        sharePercent: new Decimal(lineItem.sharePercent).toFixed(4),
        amountSar: money(lineItem.amountSar, `${distribution.id}.lineItem.amountSar`),
        transferRef: lineItem.transferRef,
        blockedReason: null,
      },
    })),
  };
}

export interface ComplianceObligationData {
  readonly code: string;
  readonly section: ComplianceSectionValue;
  readonly workstreamAr: string;
  readonly workstreamEn: string;
  readonly titleAr: string;
  readonly titleEn: string;
  readonly gate: ClassificationGateValue;
  readonly deadlineRuleKey: string | null;
  /**
   * ⊕ S8-Q1 (owner, 2026-08-23): *"Compartment the row."* Written EXPLICITLY on every seeded row
   * rather than left to migration 32's `DEFAULT 'NORMAL'`, for the reason every receipt carries a
   * `receiptClass` at entry: an unstated classification is indistinguishable from an unconsidered
   * one, and this column is the whole of whether the duty to file a SAR is visible to the compliance
   * board. The VALUE is never chosen here — it comes from `templateConfidentiality()` in
   * `@qmulate/domain/compliance`, which is where the ruling is recorded.
   */
  readonly confidentiality: ConfidentialityValue;
  /**
   * ⊕ S8-Q5 (owner, 2026-08-23). Templates are immutable WITHIN a version, so the version is part of
   * the row's identity — `UNIQUE (code, libraryVersion)`.
   *
   * ⚠ These ten rows carry `'fixture-derived'` rather than a version number, and that is deliberate:
   * they are DERIVED BACKWARDS from fixture task instances, one per task, and they are placeholders.
   * Labelling them `'2026-08-20.1'` would claim they are the canonical §09 library, which is in
   * `packages/domain/src/compliance/catalogue.ts` and arrives ALONGSIDE them as new rows.
   */
  readonly libraryVersion: string;
}

export interface ComplianceTaskData {
  readonly waqfId: string;
  readonly obligationId: string;
  /** ⊕ S8-Q5 — the FROZEN snapshot. See `schema.prisma`'s note; changing either is refused. */
  readonly templateCode: string;
  readonly templateVersion: string;
  readonly status: ComplianceTaskStatusValue;
  readonly owner: string | null;
  readonly startDate: Date | null;
  readonly startDateHijri: HijriDateString | null;
  readonly closeDate: Date | null;
  readonly closeDateHijri: HijriDateString | null;
  readonly notes: string | null;
}

const SECTION_CODE_PREFIX = {
  financial: 'FIN',
  operational: 'OPS',
  government_legal: 'GOV',
} as const satisfies Record<string, string>;

/**
 * §09 deadline-rule vocabulary, attached to the obligation TEMPLATE.
 *
 * Only the rule KEY is stored — never the window length. The number of business days resolves
 * from `Setting['deadline.<ruleKey>.businessDays']` at evaluation time, which is what makes a
 * corrected statutory window a config change rather than a migration.
 * ⚠ unverified — confirm vs primary law.
 */
const DEADLINE_RULE_KEY_BY_TASK: Readonly<Record<string, string | null>> = {
  'task-001': null,
  'task-002': 'DISTRIBUTE_3M_FYE',
  'task-003': null,
  'task-004': null,
  'task-005': 'UPDATE_15BD',
  'task-006': 'KYC_REFRESH',
  'task-007': 'ISTIBDAL_10BD',
  'task-008': null,
  // No §09 rule key: an audited-statement and a bylaw obligation are CLASSIFICATION-gated, not
  // deadline-driven. Their gate is the point, not their window.
  'task-009': null,
  'task-010': null,
};

/** Business-day windows the rule keys must be consistent with, for the cross-check below. */
const RULE_KEY_BUSINESS_DAYS: Readonly<Record<string, number>> = {
  REGISTER_30BD: 30,
  UPDATE_15BD: 15,
  ISTIBDAL_10BD: 10,
};

/**
 * [DERIVED] `ComplianceObligation` is a GLOBAL template table; the fixture only has per-endowment
 * task instances. One obligation is derived per fixture task, numbered within its section.
 *
 * Codes are namespaced `SEED-` so the canonical §09 obligation library (E7/S8) can be dropped in
 * later without colliding with these placeholders.
 */
export function deriveComplianceObligations(
  fixture: Fixture,
): ReadonlyArray<Mapped<ComplianceObligationData> & { readonly taskId: string }> {
  const counters = new Map<string, number>();
  return fixture.complianceTasks.map((task) => {
    const prefix = mapValue(SECTION_CODE_PREFIX, task.section, 'compliance section');
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    const code = `SEED-${prefix}-${String(next).padStart(2, '0')}`;

    const ruleKey = mapValue(DEADLINE_RULE_KEY_BY_TASK, task.id, 'compliance task deadline rule');
    // Cross-check: if the fixture states a window, the rule key must be the one that carries it.
    if (task.dueWithinBusinessDays !== undefined) {
      const expected = ruleKey === null ? undefined : RULE_KEY_BUSINESS_DAYS[ruleKey];
      if (expected !== task.dueWithinBusinessDays) {
        throw new SeedRefusedError(
          `fixture drift — ${task.id} states dueWithinBusinessDays=${task.dueWithinBusinessDays} ` +
            `but its deadline rule key is ${String(ruleKey)}. The window must resolve from ` +
            'Setting, and the rule key must be the one that carries that window.',
        );
      }
    }

    return {
      taskId: task.id,
      id: derivedId.obligation(code),
      data: {
        code,
        section: mapValue(COMPLIANCE_SECTION, task.section, 'compliance section'), // [MAPPED]
        workstreamAr: mapValue(WORKSTREAM_AR, task.workstream, 'compliance workstream'), // [DERIVED]
        workstreamEn: task.workstream, // [FIXTURE]
        titleAr: mapValue(OBLIGATION_TITLE_AR, task.id, 'obligation Arabic title'), // [DERIVED]
        titleEn: task.task, // [FIXTURE]
        gate: mapValue(CLASSIFICATION_GATE, task.classificationGate, 'classification gate'), // [MAPPED]
        deadlineRuleKey: ruleKey,
        // [DERIVED] Read from the ruling's own declaration rather than hardcoded, so a placeholder
        // that ever shared a code with a compartmented template would be classified with it. None
        // does today — the placeholder codes are `SEED-`-namespaced — and that is asserted rather
        // than assumed, because "it cannot happen" is how the register would leak quietly if it did.
        confidentiality: templateConfidentiality(code),
        libraryVersion: FIXTURE_LIBRARY_VERSION, // [DERIVED] — see the constant
      },
    };
  });
}

/**
 * The `libraryVersion` these DERIVED placeholder obligations carry.
 *
 * ⊕ S8-Q5 (owner, 2026-08-23). ⚠ Deliberately NOT a version number. These rows are derived backwards
 * from fixture task instances, one per task, with `SEED-`-namespaced codes; calling them
 * `'2026-08-20.1'` would claim they are the canonical §09 library, which lives in
 * `packages/domain/src/compliance/catalogue.ts` and arrives alongside them as NEW rows — never as an
 * edit, which is exactly what migration 31's immutability guard enforces.
 */
export const FIXTURE_LIBRARY_VERSION = 'fixture-derived';

/**
 * [PROJECTION] The CANONICAL §09 obligation library, as rows.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THIS FUNCTION AUTHORS NOTHING. IT IS A PROJECTION, AND THAT IS THE WHOLE DESIGN.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every value comes from `packages/domain/src/compliance/catalogue.ts`, whose own rule is that
 * nothing in IT is authored either: `titleAr`/`workstreamAr` are byte-for-byte quotes from
 * `docs/domain/unified-framework.md`, and the English cells, gates and rule keys are transcribed from
 * §09's library tables. `catalogue-source-fidelity.test.ts` re-reads both source documents on every
 * run and compares character by character. So the chain from the regulation to a database row has no
 * link in it where somebody typed a sentence.
 *
 * The one value this function contributes is `confidentiality`, and it does not choose that either —
 * {@link templateConfidentiality} carries the owner's S8-Q1 ruling.
 *
 * ── WHAT ARRIVES ALONGSIDE WHAT ─────────────────────────────────────────────────────────────
 * These rows land BESIDE the ten `SEED-`-namespaced placeholders, never as an edit to them. That is
 * migration 31's constraint, S8-Q5's ruling, and the reason the two carry different
 * `libraryVersion`s: `'fixture-derived'` reads as *a placeholder derived backwards from a task*, and
 * `'2026-08-20.1'` reads as *a published library release*. A caller can tell them apart from the row.
 *
 * ⚠ **36 ROWS, NOT 37, AND THE MISSING ONE IS A MEASUREMENT.** `templatesWithheldFromRegister()`
 * derives the difference: `compliance_obligation.titleAr` is NOT NULL and `GOV-COI-01` (Nazarah
 * Art. 18) has no Arabic anywhere in the framework to put in it. The withheld set is REPORTED by the
 * seed rather than silently subtracted — a library that shrinks quietly is a register missing a duty
 * quietly — and it empties by itself the day the Arabic lands or the column is relaxed.
 *
 * ⚠ **NOTHING IS COERCED.** A catalogue gate the schema's enum does not know, or a `titleAr` that is
 * null after the withheld filter, REFUSES THE WHOLE SEED. Both are `SeedRefusedError`s rather than
 * casts, because the alternative is a compliance row that reads as valid and gates nothing — and a
 * duty nobody can read must never look like a duty that does not apply.
 */
export function deriveCanonicalObligations(): ReadonlyArray<Mapped<ComplianceObligationData>> {
  return storableTemplates().map((template) => ({
    id: derivedId.libraryObligation(template.code, template.libraryVersion),
    data: {
      code: template.code, // [CATALOGUE]
      section: template.section, // [CATALOGUE]
      workstreamAr: template.workstreamAr, // [CATALOGUE — quoted from unified-framework.md]
      workstreamEn: template.workstreamEn, // [CATALOGUE]
      titleAr: requireArabicTitle(template), // [CATALOGUE — quoted]
      titleEn: template.titleEn, // [CATALOGUE]
      gate: requireKnownGate(template), // [CATALOGUE — validated against the enum, never cast]
      deadlineRuleKey: template.deadlineRuleKey, // [CATALOGUE]
      confidentiality: templateConfidentiality(template.code), // [OWNER RULING S8-Q1]
      libraryVersion: template.libraryVersion, // [CATALOGUE]
    },
  }));
}

/**
 * The gate, proven to be a member of the schema's enum.
 *
 * `ObligationTemplate.gate` is a bare `string` on purpose — the catalogue contract explains why — so
 * something has to check it, and a `as ClassificationGateValue` at the seed boundary is exactly the
 * cast `mayDispatch`'s doc warns about: it turns an unrecognised value into an accepted one on the
 * security-relevant side. The seed refuses instead.
 */
function requireKnownGate(template: ObligationTemplate): ClassificationGateValue {
  const known = Object.values(CLASSIFICATION_GATE) as readonly string[];
  if (!known.includes(template.gate))
    throw new SeedRefusedError(
      `catalogue drift — obligation ${template.code} carries gate '${template.gate}', which is not ` +
        `a ClassificationGate member (${known.join(', ')}). A gate the resolver cannot read makes ` +
        'the duty look inapplicable rather than unreadable, so the seed refuses rather than ' +
        'storing it.',
    );
  return template.gate as ClassificationGateValue;
}

/**
 * The Arabic title, proven present.
 *
 * Unreachable through {@link deriveCanonicalObligations}, because `storableTemplates()` has already
 * removed every null — which is precisely why it is here: the day somebody "simplifies" that filter
 * away, this refuses the seed instead of Postgres refusing it with a NOT NULL violation that names a
 * column and not a reason.
 */
function requireArabicTitle(template: ObligationTemplate): string {
  if (template.titleAr === null)
    throw new SeedRefusedError(
      `catalogue drift — obligation ${template.code} has no Arabic title, and ` +
        '`compliance_obligation.titleAr` is NOT NULL. It should have been removed by ' +
        'templatesWithheldFromRegister(); composing Arabic for it here would be inventing the ' +
        'wording of a regulatory obligation, which this seed will not do.',
    );
  return template.titleAr;
}

/** Re-exported for the seed's report and its tests, so neither re-derives the withheld set. */
export { OBLIGATION_LIBRARY_VERSION, templatesWithheldFromRegister };

export function mapComplianceTask(
  task: FixtureComplianceTask,
  obligationId: string,
  obligationCode: string,
): Mapped<ComplianceTaskData> {
  const start = dualOrNull(task.startDate, `${task.id}.startDate`);
  const close = dualOrNull(task.closeDate, `${task.id}.closeDate`);
  return {
    id: task.id,
    data: {
      waqfId: task.waqfId,
      obligationId,
      // ⊕ S8-Q5 — the FROZEN snapshot, taken at instantiation and refused thereafter. Passed in
      // rather than looked up so the seed cannot drift from the obligation it actually linked.
      templateCode: obligationCode,
      templateVersion: FIXTURE_LIBRARY_VERSION,
      status: mapValue(COMPLIANCE_TASK_STATUS, task.status, 'compliance task status'), // [MAPPED]
      owner: null, // [DERIVED] the fixture names no owner; left null rather than assigned
      startDate: start.gregorian,
      startDateHijri: start.hijri,
      closeDate: close.gregorian,
      closeDateHijri: close.hijri,
      notes: null,
    },
  };
}

export interface GovernmentFilingData {
  readonly waqfId: string;
  readonly platform: GovernmentPlatformValue;
  readonly status: FilingStatusValue;
  readonly lastUpdated: Date | null;
  readonly lastUpdatedHijri: HijriDateString | null;
}

export function mapGovernmentFiling(filing: FixtureGovernmentFiling): Mapped<GovernmentFilingData> {
  const lastUpdated = dualOrNull(filing.lastUpdated, `${filing.id}.lastUpdated`);
  return {
    id: filing.id,
    data: {
      waqfId: filing.waqfId,
      platform: mapValue(GOVERNMENT_PLATFORM, filing.platform, 'government platform'), // [MAPPED]
      status: mapValue(FILING_STATUS, filing.status, 'government filing status'), // [MAPPED]
      lastUpdated: lastUpdated.gregorian,
      lastUpdatedHijri: lastUpdated.hijri,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 5. [DERIVED] IDENTITY, ACCESS GRANTS, MEMBERSHIPS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The fixture models endowments, not logins. These users exist so E0's "a seeded admin can
// register, enrol TOTP and log in" and E2's access-matrix tests have subjects to act on.
//
// NO PASSWORD HASH IS SEEDED. Only the `User` row is written; better-auth's `Account` row (which
// holds the credential) is deliberately absent, so the password is set through better-auth's own
// sign-up / set-password flow on first use. Inventing a hash would put an unowned credential in
// every environment that ever runs the seed.
//
// Every address uses the reserved `@example.test` domain so the post-seed provenance scan (B6)
// cannot mistake a seeded login for a real person.

export interface SeedUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly locale: string;
  /**
   * FALSE on purpose. TOTP is mandatory for money-movement and filing roles (NFR-06), but the E0
   * exit criterion is that a seeded admin ENROLS TOTP — which requires starting from un-enrolled.
   */
  readonly twoFactorEnabled: boolean;
  readonly emailVerified: boolean;
  readonly isActive: boolean;
  /** The role this user is granted on every endowment; null = no grants at all. */
  readonly grantRole: RoleValue | null;
  /** Set for a beneficiary login: pins them to exactly one beneficiary record (§10 §5). */
  readonly beneficiarySelfId: string | null;
  /** When set, the user is granted only on this endowment rather than on all of them. */
  /**
   * `null` = every fixture endowment; a string = ONE endowment; ⊕ S11 item 2b — a LIST = exactly those
   * endowments (the compliance E2E seat proves three board states on three endowments, no more).
   */
  readonly onlyWaqfId: string | readonly string[] | null;
  /**
   * S10/T2 — set ONLY on a DECLARED SERVICE SEAT (owner ruling 2026-08-27 + D1 2026-08-28).
   * Two consequences, coupled on purpose because the ruling couples them:
   *   · the seat gets NO credential `account` row (§2b skips it) — nothing can ever sign in as
   *     it, so "non-human" is a property of the identity plane, not a naming convention;
   *   · its grants carry THESE permissions/dataScopes instead of the role's standard shape —
   *     "enumerated minimal permissions", narrowed by the same grant ∩ preset algebra as every
   *     seat (narrowing is the safe direction; the seed's own D-5 note).
   */
  readonly serviceSeat?: {
    readonly permissions: readonly string[];
    readonly dataScopes: readonly string[];
  };
  readonly note: string;
}

export const SEED_ADMIN_EMAIL = 'admin@example.test';

// The fixture-only sign-in password (a published constant, not a secret) moved to
// `./credentials.ts` in S10, alongside the precomputed better-auth-format hash that replaced this
// package's last runtime `better-auth` import — the full reasoning lives in that file's header.
// Re-exported here so the seed's import surface is unchanged.
export { SEED_PASSWORD } from './credentials.js';

export const SEED_USERS: readonly SeedUser[] = [
  {
    id: 'user-seed-admin',
    name: 'Seed Administrator (fictional)',
    email: SEED_ADMIN_EMAIL,
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    // SYSTEM_ADMIN authority is platform-level, not per-endowment: deliberately NO WaqfAccessGrant,
    // so nothing in the access matrix is silently satisfied by "the admin has a grant".
    grantRole: null,
    beneficiarySelfId: null,
    onlyWaqfId: null,
    note: 'E0 exit subject: registers, enrols TOTP, logs in. Password set at first sign-up.',
  },
  {
    id: 'user-nazir-001',
    name: 'Nazir Operator (fictional)',
    email: 'nazir@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    grantRole: 'NAZIR',
    beneficiarySelfId: null,
    onlyWaqfId: null,
    note: 'Primary trustee operator across all four endowments.',
  },
  {
    id: 'user-accountant-001',
    name: 'Waqf Accountant (fictional)',
    email: 'accountant@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    // Was `ACCOUNTANT`; that value was a synonym for FINANCE and was removed by ADR-0004.
    grantRole: 'FINANCE',
    beneficiarySelfId: null,
    onlyWaqfId: null,
    note: 'Finance-scoped subject for maker-side tests.',
  },
  {
    id: 'user-approver-001',
    name: 'Second Nazir (fictional)',
    email: 'approver@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    /**
     * ⚠ CHANGED BY ADR-0004, and worth reading before touching.
     *
     * This seat used to hold `grantRole: 'APPROVER'`. That enum value is now GONE — removed,
     * not remapped, because §10 models approval as an ACTION the Nazir holds and a standing
     * approver role would create the second approval authority BR-105/BR-1103 forbid.
     *
     * The seat itself is still needed: its documented purpose is to be a DISTINCT CHECKER so
     * maker-checker tests can assert `checkerId !== makerId`. Under §10.2 §4 the required
     * distinct approver on a bank movement or distribution run **is a `nazir`** — so the
     * checker-side fixture is a second NAZIR grant, which is what the authority model already
     * says it must be. This is not APPROVER under another name: it is the seat pointed at the
     * role that actually holds the authority.
     *
     * ── ⚠ SETTLED BY PRODUCT-OWNER DECISION PO-2 (2026-07-28) — DO NOT REMOVE THIS SEAT. ─────
     * The earlier version of this note called two Nazir grants on one endowment "a fixture
     * convenience" and carried a TODO offering to drop this user and re-point the maker-checker
     * tests at `user-nazir-001`. **That TODO is withdrawn: the product owner decided the approval
     * claim is ROLE-level, not PERSON-level.** Several people may legitimately hold the Nazir role
     * — cover, leave, succession — so two holders is the INTENDED shape rather than a shortcut, and
     * BR-105/BR-1103's "sole approval authority" is a statement about the role, not a headcount.
     *
     * The invariant that actually matters is **maker ≠ approver**, which is enforced at the
     * database and in the procedure ladder and is separately tested. No
     * one-approver-per-endowment constraint may be added.
     *
     * Still true, and unrelated: the DEED names one primary Nazir plus an authorized
     * representative (`TrusteeshipDeed`), and that stays the source of truth for who the Nazir is.
     * It cannot yet be compared programmatically to the access matrix — `primaryNazir` and
     * `authorizedRepName` are name strings with no `userId` FK (surfaced: UD-15 proposes the FK).
     */
    grantRole: 'NAZIR',
    beneficiarySelfId: null,
    onlyWaqfId: null,
    note: 'Checker-side subject: maker-checker requires checkerId !== makerId (§10.2 §4: the distinct approver is a nazir).',
  },
  {
    id: 'user-family-board',
    name: 'Family Board Contact (fictional)',
    email: 'board@example.test', // [FIXTURE] clients[0].familyBoardContact
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    grantRole: 'FAMILY_BOARD',
    beneficiarySelfId: null,
    onlyWaqfId: null,
    note: 'Also holds the client-level Membership: the board sees the whole family.',
  },
  {
    id: 'user-unscoped',
    name: 'Unscoped User (fictional)',
    email: 'unscoped@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    // ZERO GRANTS, DELIBERATELY. This user is the negative-test subject: a scoped procedure must
    // deny them, and the fail-closed force-filter must return nothing rather than everything.
    grantRole: null,
    beneficiarySelfId: null,
    onlyWaqfId: null,
    note: 'Negative-test subject (V-5). Must never be given a grant.',
  },
  {
    id: 'user-beneficiary-ben-001',
    name: 'Beneficiary Portal User (fictional)',
    email: 'beneficiary.ben-001@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    grantRole: 'BENEFICIARY',
    // Pinned to their own record: a beneficiary can never enumerate co-beneficiaries, other
    // endowments, or the raw ledger.
    beneficiarySelfId: 'ben-001',
    onlyWaqfId: 'waqf-001',
    note:
      'TODO(surface): LEGAL — this is the first beneficiary-linked login the system models. ' +
      'Confirm that seeding one, even fictional, is acceptable before the portal ships (E9).',
  },
  {
    /**
     * ⚠ APPENDED IN S2 ROUND 4 BY PRODUCT-OWNER DECISION PO-1 (2026-07-28). Read before moving it.
     *
     * ⚠ AND IT IS **LAST** FOR A MECHANICAL REASON, NOT A TIDY ONE. `SEED_USERS` insertion order
     * drives each audit event's `occurredAt` ordinal (`SEED_EPOCH + <ordinal>`) and therefore the
     * whole append-only hash chain. Inserting this seat anywhere but the END would renumber every
     * later ordinal and rewrite the chain for no reason. APPEND; never reorder.
     *
     * ── WHY THE FIXTURE NOW SHIPS AN ADMIN SEAT ────────────────────────────────────────────────
     * Before this row, **not one of the seventeen seeded grants carried `admin:access_matrix:write`**
     * — measured, zero rows. `GRANT_SHAPE_BY_ROLE` simply had no admin shape. Two consequences
     * followed, and both were real:
     *
     *   1. The USER branch of `qmulate_grant_admission()` (migration 5 §2a §3) — "the acting identity
     *      must hold `admin:access_matrix:write` on THIS endowment" — was **unreachable from fixture
     *      data**. Every test that needed it had to bootstrap an admin seat itself through the SYSTEM
     *      branch first (`grant-admission.integration.test.ts` still does), so the legitimate issuing
     *      path was never exercised end to end on a plain `migrate deploy && db:seed` database.
     *   2. `activateGrant()` in `packages/api` had no caller who could legally use it, which makes
     *      E3's first access-matrix screen unbuildable without hand-provisioning a seat in SQL.
     *
     * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────────────────────
     * It is NOT the removal of the SYSTEM bootstrap branch, and it does not make that removal
     * possible. See `migrations/00000000000007_e2_grant_authority_precedence/migration.sql` for the
     * executed proof: the seed writes every one of its grants as ONE SYSTEM actor
     * (`user-seed-admin`), and that actor cannot be given an admin seat of its own — CHECK
     * `waqf_access_grant_no_self_issue` (`grantedByUserId <> userId`) forbids a self-issued row and
     * §2b binds `grantedByUserId` to the marker's actor, so no third party can issue it either. With
     * the SYSTEM branch gone, `pnpm db:seed` fails at COMMIT with 42501.
     *
     * ── ONE GRANT, ON ONE ENDOWMENT, DELIBERATELY ──────────────────────────────────────────────
     * `onlyWaqfId: 'waqf-001'`. §10 principle 2: authority is per ENDOWMENT, never per family. An
     * admin seat is also the single most impersonation-worthy row in the database — a raw-SQL caller
     * who forges a marker naming this seat is admitted by the USER branch — so the fixture ships the
     * narrowest version that satisfies PO-1: `waqf-002/003/004` keep **no** established admin holder
     * at all, and `grant-authority-precedence.integration.test.ts` pins both halves (it may issue on
     * waqf-001; it may not on waqf-002).
     */
    id: 'user-admin-001',
    name: 'Access-Matrix Administrator (fictional)',
    email: 'matrix-admin@example.test',
    locale: 'ar',
    // The convention every other seeded operator follows: enrolment starts from un-enrolled, and
    // step-up is irrelevant to this seat anyway — `admin` holds no `approve`/`sign` verb (§10 §2.1:
    // "config authority ≠ governance authority"), which `preset-parity.test.ts` proves is a subset
    // relation rather than a promise.
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    grantRole: 'SYSTEM_ADMIN',
    beneficiarySelfId: null,
    onlyWaqfId: 'waqf-001',
    note:
      'PO-1: the ONE seeded holder of admin:access_matrix:write. Issues seats; can never approve ' +
      'or sign one (§10 §2.1, §4.1 — an access-matrix change on a live endowment additionally ' +
      'needs a recorded Nazir acknowledgement, which is E11’s chain-step and is NOT modelled here).',
  },
  {
    /**
     * ⚠ APPENDED IN THE S4/E3 CLOSE-OUT BY PRODUCT-OWNER DECISION D-E (2026-08-16).
     *
     * ⚠ AND IT IS **LAST** FOR THE SAME MECHANICAL REASON `user-admin-001` is: `SEED_USERS`
     * insertion order drives each audit event's `occurredAt` ordinal (`SEED_EPOCH + <ordinal>`) and
     * therefore the whole append-only hash chain. APPEND; never reorder.
     *
     * ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────────────
     * The owner named three holders of the trusteeship deed — *"deed can be seen by nazir, case
     * manager and elegible beneficiaries"* — and the fixture had NO `case_manager` seat at all, so
     * the second of the three could not be granted anything and §3 row 1's `R W` cell for that role
     * had no subject. Measured alongside it: zero of the eighteen seeded grants carried
     * `endowment:deed:*` or `legal:reserved_matter:*` (V-E3-L1), which made E3's exit clause
     * unreachable by every user that existed.
     *
     * ── ON ALL ENDOWMENTS, UNLIKE THE ADMIN SEAT ──────────────────────────────────────────────
     * `onlyWaqfId: null`. A case manager is an operational seat over the engagement, the same shape
     * as the nazir and finance seats; the admin seat is pinned to one endowment because an
     * access-matrix issuer is the most impersonation-worthy row in the database (PO-1) and this is
     * not that. The grant is READ-heavy and carries no `approve`, no `sign` and no deed write.
     */
    id: 'user-case-manager-001',
    name: 'Case Manager (fictional)',
    email: 'case-manager@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    grantRole: 'CASE_MANAGER',
    beneficiarySelfId: null,
    onlyWaqfId: null,
    note:
      'D-E: the second of the owner’s three deed readers. Deed READ only. ⊕ Deed WRITE was RULED ON ' +
      'on 2026-08-17 (memo Q10): the nazir seat RECORDS an appointment once and no seat may edit a ' +
      'recorded one — so this seat gains nothing, and the earlier "named fallback" is superseded.',
  },
  {
    /**
     * ══ THE DECLARED SERVICE SEAT — the deadline sweep's identity (S10/T2) ════════════════════
     *
     * The owner's ruling, third batch 2026-08-27: a declared NON-HUMAN identity, "enumerated
     * minimal permissions (`compliance:task:write` only), granted on every endowment it sweeps,
     * visible in the access matrix like any seat, its writes audited as SYSTEM-actor acts —
     * never maker acts". D1 (2026-08-28) fixed the actor type: `SYSTEM`, bypass NOT inherited
     * from a default — `makeServiceSeatContext` is the only constructor and takes no bypass.
     *
     * ── WHY `grantRole: 'COMPLIANCE_OFFICER'` ─────────────────────────────────────────────────
     * `Role` is ADR-0004's closed THIRTEEN; a dedicated SERVICE role would be a fourteenth enum
     * member — a migration and an owner decision, deliberately NOT taken here. The seat rides
     * the role whose preset contains its one permission, and `serviceSeat.permissions` narrows
     * the stored set to exactly that permission; the effective set is `stored ∩ preset`, so the
     * matrix shows a seat holding `compliance:task:write` and NOTHING else. Narrowing is the
     * safe direction (D-5); the role CELL reads as compliance_officer, which is honest — the
     * seat does that role's sweep work, without its hands.
     *
     * ── NON-HUMAN AS A STRUCTURAL FACT ────────────────────────────────────────────────────────
     * `serviceSeat` present ⇒ §2b creates NO credential account: there is no password, so
     * nothing can EVER sign in as this seat — rung 1 (an `authorized` session + universal TOTP)
     * is unreachable, which is exactly why the worker constructs its context in-process (memo
     * D1's consequence). The seat can approve nothing: it is not a NAZIR, `makerProcedure`'s
     * approval table gate refuses it, and MP-23 refuses SYSTEM/SERVICE actors at the boundary.
     *
     * ── FIXTURE GRANTS ARE NOT THE PRODUCTION MECHANISM ───────────────────────────────────────
     * `onlyWaqfId: null` grants it on every FIXTURE endowment — the ruling's "granted on every
     * endowment it sweeps" enacted for the seed. How a PRODUCTION endowment gets this grant at
     * creation is the owner's HELD item (deliberately held until the coverage control yields
     * evidence) and E11 onboarding territory; an endowment nobody grants the seat is exactly
     * what the T2 coverage control makes LOUD instead of silent.
     */
    id: 'user-service-deadline-sweeper',
    name: 'Deadline sweep — declared service seat (non-human)',
    email: 'service.deadline-sweeper@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    grantRole: 'COMPLIANCE_OFFICER',
    beneficiarySelfId: null,
    onlyWaqfId: null,
    serviceSeat: {
      permissions: ['compliance:task:write'],
      dataScopes: ['compliance'],
    },
    note:
      'S10/T2: the declared service seat (owner ruling 2026-08-27; D1 2026-08-28 — SYSTEM, bypass ' +
      'explicitly not inherited). No credential account exists for it BY CONSTRUCTION (§2b skips ' +
      'serviceSeat users); its context is built in-process by makeServiceSeatContext only.',
  },
  {
    /**
     * ══ THE SWEEP-COVERAGE CONTROL'S PRINCIPAL (S10/T2) — NOT the sweep seat ═════════════════
     *
     * The control that reports endowments the sweep seat cannot see must be STRUCTURALLY
     * OUTSIDE that seat, or it inherits the blind spot and reports zero forever. Outside starts
     * with identity: its SWEEP_COVERAGE_GAP audit events are attributed to THIS principal, so
     * the ≥10-year trail shows the control noticing — never the seat confessing, and never an
     * unattributed SYSTEM row. It holds NO grants (`grantRole: null` — its reads go through the
     * unextended base client, which needs none) and NO credential (`serviceSeat` present, §2b
     * skips it), so it can neither sign in nor touch endowment data: it can only look at the
     * catalogue and write its own named events.
     */
    id: 'user-control-sweep-coverage',
    name: 'Sweep-coverage control (non-human)',
    email: 'control.sweep-coverage@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    grantRole: null,
    beneficiarySelfId: null,
    onlyWaqfId: null,
    serviceSeat: { permissions: [], dataScopes: [] },
    note:
      "S10/T2: the sweep-coverage control's own principal — G-5 second bound. Zero grants, zero " +
      'credential; exists so SWEEP_COVERAGE_GAP events carry a named, distinct, non-seat identity.',
  },
  {
    /**
     * ⊕ S11-2 — the seated WRITE journey's seat, owed since S11-1 ("the harness enrols one read-only
     * seat"). Every human seat above is CLAIMED by exactly one E2E spec and TOTP enrolment is a
     * one-way door, so a browser journey that WRITES needs a seat nobody else holds. CASE_MANAGER
     * (holds `compliance:task:write`, the discharge verb; no approve, no sign, no deed write) on
     * waqf-004 ALONE — the fixture endowment whose invented clock-start is left undischarged for
     * this journey to discharge. APPENDED LAST: `SEED_USERS` order drives every audit event's
     * `occurredAt` ordinal and therefore the hash chain. Fictional; fixture-only credential.
     */
    id: 'user-compliance-001',
    name: 'Compliance Officer — E2E write seat (fictional)',
    email: 'compliance@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    grantRole: 'CASE_MANAGER',
    beneficiarySelfId: null,
    // ⊕ S11 item 2b — THREE endowments, each there to prove one board state (the orchestrator's amendment):
    //   waqf-003 · the overdue Authority UPDATE (E10's exit words — the red board) AND NOT_RECORDED on
    //              REGISTER_30BD in the same board (its registrationAnchor is null): two cause families;
    //   waqf-004 · the seat's home and the write journey's subject: anchor recorded, in coverage, left
    //              undischarged on purpose; certificate valid to 2027 → NOT_IN_SCOPE_YET; healthy-by-fact
    //              once the journey discharges it;
    //   waqf-007 · RECORDED_NOT_COMPUTABLE (anchor 2015, outside the calendar's real coverage) — the one
    //              family nothing else renders, the distinction the honesty design exists for.
    //   NOT waqf-005: its maal clause is unread by design; no stage spends that write-once state.
    onlyWaqfId: ['waqf-003', 'waqf-004', 'waqf-007'],
    note:
      'S11-2: the seated WRITE E2E seat — discharges waqf-004’s invented registration duty in the ' +
      'browser journey. ⊕ S11 item 2b: THREE grants (003 red board + NOT_RECORDED · 004 home, open, ' +
      'NOT_IN_SCOPE_YET · 007 RECORDED_NOT_COMPUTABLE); claimed by compliance-journey.spec.ts.',
  },
  {
    /**
     * ⊕ S11 item 2c — THE READ-ONLY FINANCIAL SEAT, for the `/financials` browser journey.
     *
     * The read-only mirror of S11-2's act: every human seat was already claimed by exactly one spec
     * and TOTP enrolment is a one-way door, so this journey needed a seat nobody else holds. AUDITOR
     * is one of the locked thirteen and its preset is seventeen verbs, ALL of them `:read` — see
     * `GRANT_SHAPE_BY_ROLE.AUDITOR` for which TWO of the seventeen this seat carries, which fifteen
     * are withheld, and why withholding `endowment:waqf:read` would have narrowed understanding
     * rather than exposure.
     *
     * APPENDED LAST, after `user-compliance-001`: `SEED_USERS` order drives every audit event's
     * `occurredAt` ordinal and therefore the hash chain, so a seat inserted mid-array would rewrite
     * every subsequent event's position. Fictional; fixture-only credential.
     */
    id: 'user-auditor-001',
    name: 'Auditor — E2E financial read seat (fictional)',
    email: 'auditor@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    grantRole: 'AUDITOR',
    beneficiarySelfId: null,
    /**
     * FIVE endowments, each there to prove one financial state — 2b's precedent applied: name what is
     * proven and no more.
     *   waqf-001 · the BLENDED-FIGURE defect, UNHEDGED: income 350,000.00 beside 4,200,000.00 of
     *              ISTIBDAL_PROCEEDS — capital by a RULED classification (S4 memo Q6), so the row
     *              opens no fiqh question — 93.9% of one account's net being principal;
     *   waqf-003 · the same wall AT SCALE and the pinnable one (1,800,000.00 income beside
     *              20,000,000.00 corpus). Its class is "USUALLY capital" (memo Q6(d)) — hedged, which
     *              is why waqf-001 leads the demonstration;
     *   waqf-004 · DIRECT UTILIZATION (`directUtilization: true`, deed: "No yield is distributed") —
     *              §14 §5.1(3) requires the report to STATE this rather than show zeros;
     *   waqf-005 · the INTAKE STATE (`reversionClauseCaptured: false`) — an all-zero payload
     *              IDENTICAL to waqf-004's with a different meaning, which is the whole point;
     *   waqf-007 · the healthy simple board (one 400,000.00 income receipt, no capital, no expenses).
     *   NOT waqf-002: v2 dropped fee-silence as a financial-screen state — `finance.summary` returns
     *   no fee field at all, so this screen cannot show it.
     * ⚠ Reading waqf-005's reversion FLAG spends nothing; the write-once act is CAPTURING the clause,
     * which no repeatable test may do and this screen never touches.
     */
    onlyWaqfId: ['waqf-001', 'waqf-003', 'waqf-004', 'waqf-005', 'waqf-007'],
    note:
      'S11 item 2c: the read-only /financials E2E seat — AUDITOR, two verbs of seventeen ' +
      '(finance:transaction:read + endowment:waqf:read), fifteen withheld. FIVE grants, one per ' +
      'financial state proven; claimed by financials-journey.spec.ts alone.',
  },
  {
    /**
     * ⊕ S12-2 — THE RESERVED-MATTER CLERK, for the BR-1102 chain browser journey.
     *
     * Owner rulings 2026-09-08: STAFF record the principal's written consent and the counsel review
     * against a reference, and counsel review is required on EVERY reserved matter. The journey
     * therefore needs ONE seat that can both RAISE a kinded matter (`approval:request:initiate`) and
     * RECORD its steps (`legal:reserved_matter:write`). MEASURED before this seat existed: no seeded
     * seat held both — the NAZIR shapes hold write but not initiate, the CASE_MANAGER shape holds
     * initiate but not write — and both NAZIR seats are TOTP-enrolled in-file by other specs
     * (`auth-journey` takes nazir@, `kernel` takes approver@), so a second handshake on either would
     * break the first enrolment or go stale behind it. A compliance officer's PRESET carries both verbs
     * (§10 §3 row 8 `R W`; `@qmulate/domain` ROLE_PRESETS.compliance_officer), so this is the honest
     * seat: one endowment (waqf-004, the compliance write seat's home), five verbs of twenty-nine.
     *
     * APPENDED LAST, after `user-auditor-001`, for the ordinal reason the auditor's note gives.
     * Fictional; fixture-only credential; claimed by reserved-chain.spec.ts alone.
     */
    id: 'user-reserved-clerk-001',
    name: 'Reserved-matter clerk — E2E chain seat (fictional)',
    email: 'clerk@example.test',
    locale: 'ar',
    twoFactorEnabled: false,
    emailVerified: false,
    isActive: true,
    grantRole: 'COMPLIANCE_OFFICER',
    beneficiarySelfId: null,
    onlyWaqfId: 'waqf-004',
    note:
      'S12-2: the seated BR-1102 chain E2E seat — raises a kinded reserved matter and records its ' +
      'principal-consent and counsel-review steps in the browser journey; the sign stays the ' +
      'Nazir’s. ONE grant (waqf-004); claimed by reserved-chain.spec.ts and onboarding-gate.spec.ts.',
  },
];

export interface GrantShape {
  readonly permissions: readonly string[];
  readonly dataScopes: readonly string[];
  readonly canViewAmlRestricted: boolean;
  readonly amlCompartment: boolean;
}

/**
 * The permission tuples every seeded grant carries.
 *
 * ── NO LONGER PROVISIONAL (E2/S2) ────────────────────────────────────────────────────────────
 * Sprint 1 labelled these "PROVISIONAL fixtures … nothing in production should read them", and
 * they used verbs and modules §10 §3's grid does not have: `waqf:waqf:update`,
 * `finance:transaction:create`, `portal:statement:read` (verbs `create`/`update`; modules `waqf`/
 * `portal`). Three things now make that unacceptable rather than merely untidy:
 *
 *   1. `packages/domain/src/access.ts` ships the CLOSED registry — thirteen modules × a registered
 *      resource list × five verbs — so `finance:transaction:create` is not a narrower permission,
 *      it is an UNPARSEABLE one that grants nothing. A fixture that hands out strings the resolver
 *      rejects tests the resolver's failure path and nothing else.
 *   2. `packages/database/test/preset-parity.test.ts` (MP-21) asserts that every seeded grant shape
 *      is a proven SUBSET of `ROLE_PRESETS` for the same role, so a seed can never hand out a
 *      capability the preset denies.
 *   3. The `waqf_access_grant_permission_guard` trigger REFUSES an unparseable string, an unknown
 *      verb, a wildcard, and any `approve`/`sign` on a non-NAZIR role. The old strings would not
 *      load at all.
 *
 * Each list below is a deliberate NARROWING of that role's preset — the seat's read surface plus
 * the one or two verbs the fixture's own scenarios need — never a widening. The preset is the
 * ceiling; a grant may narrow it (§10 principle 3).
 *
 * ⚠ THE ROLE KEY IS THE `Role` ENUM SPELLING (SCREAMING_SNAKE); the permission strings use §10's
 * product vocabulary. `roleKeyFromDbRole()` in `@qmulate/domain` is the one translation, and
 * `preset-parity.test.ts` drives the comparison through it rather than lower-casing here.
 */
export const GRANT_SHAPE_BY_ROLE: Readonly<Record<string, GrantShape>> = {
  NAZIR: {
    permissions: [
      'endowment:waqf:read',
      'endowment:waqf:write',
      // ── ADDED IN THE S4/E3 CLOSE-OUT (V-E3-L1, owner decision D-E) ──────────────────────────
      //
      // MEASURED BEFORE: not ONE of the eighteen seeded grants carried `endowment:deed:*` or
      // `legal:reserved_matter:*` — zero rows — so §17's E3 exit clause ("the reason renders as a
      // human-readable statement" on the deed screen) and the whole reserved-matter screen were
      // UNREACHABLE BY EVERY USER THAT EXISTS. A screen no seeded seat can open is a screen whose
      // exit clause cannot be demonstrated.
      //
      // Asked who holds the deed, the product owner answered: *"deed can be seen by nazir, case
      // manager and elegible beneficiaries - i dont see the problem"* (D-E). READ therefore goes to
      // the nazir seat and to the new CASE_MANAGER seat below.
      //
      // ⊕ `write` AND `sign` WERE A NAMED FALLBACK UNTIL 2026-08-17, AND ARE NOW THE RULING'S SHAPE.
      // Asked again, about the TRUSTEESHIP deed specifically, the owner answered (memo Q10): *"the
      // trusteeship deed can only be editted by a court judge."* So `endowment:deed:write` on the
      // `nazir` seat is exactly the INITIAL RECORDING and nothing more — `trusteeship_deed_no_update`
      // (migration 17) refuses every UPDATE to a recorded appointment for EVERY seat, so no wider
      // holder could do anything with the verb even if one were granted it. ⚠ The rendering of "a
      // judge may edit" as "a court-ordered change is a NEW SUPERSEDING RECORD" is ENGINEERING'S and
      // is flagged for his confirmation; the schema cannot express it yet (E4). `sign` is
      // the rung `endowment.recordDeedTerms` and `DOMAIN_WRITE_POLICIES.Waqf.overrides` sit on
      // (`nazir` is the only preset that may hold a `sign` verb at all, D-1/D-2), so without it the
      // FIRST recording of a deed term — and the creation of an endowment — is impossible for
      // every seeded seat.
      'endowment:deed:read',
      'endowment:deed:write',
      'endowment:deed:sign',
      // The reserved-matter chain, so the screen is reachable and BR-306's gate is exercisable.
      // ⚠ NOT `counsel`. Asked whether counsel should be able to mark a matter reserved, the owner
      // answered *"no"* (D-D) — and the fixture has no counsel seat, so nothing here contradicts
      // him. `reservedMatter.markReserved` also needs `approval:request:initiate|approve`, which
      // this shape already carries below; ADR-0005 puts initiation with the Nazir and the
      // authorized representative, which is what this is.
      'legal:reserved_matter:read',
      'legal:reserved_matter:write',
      'legal:reserved_matter:approve',
      'finance:transaction:read',
      'distribution:run:read',
      'compliance:task:read',
      // Approval is the NAZIR's action (§10 §3 `A*`/`S*`, BR-105/BR-1103) and the `nazir` preset is
      // THE ONLY ONE that may contain an `approve` or `sign` verb (D-1/D-2). Moved here from the
      // deleted APPROVER shape by ADR-0004 — the authority did not disappear with the role, it went
      // where the authority model always said it lived.
      'approval:request:read',
      'approval:request:approve',
    ],
    dataScopes: ['finance', 'beneficiary', 'compliance', 'documents'],
    canViewAmlRestricted: false,
    amlCompartment: false,
  },
  // Renamed from ACCOUNTANT by ADR-0004 (synonym removed). The maker under SoD: initiates bank
  // movements and distribution runs, never authorizes them (§10 §4.2). `initiate`, never `approve`.
  FINANCE: {
    permissions: [
      'finance:transaction:read',
      'finance:transaction:write',
      'distribution:run:read',
      'distribution:run:initiate',
      'approval:request:read',
      'approval:request:initiate',
    ],
    dataScopes: ['finance'],
    canViewAmlRestricted: false,
    amlCompartment: false,
  },
  // NOTE: there is deliberately no APPROVER shape. `approval:request:approve` belongs to the
  // NAZIR shape, because approval is the Nazir's action (BR-105/BR-1103) — see ADR-0004.
  //
  /**
   * NEW IN S2 ROUND 4 (PO-1). The access-matrix administrator — §10's `admin`, spelled
   * `SYSTEM_ADMIN` in the `Role` enum (ADR-0004; `roleKeyFromDbRole()` is the one translation).
   *
   * ⚠ WHAT IS ABSENT IS THE POINT. No `approve`, no `sign`, on any module — §10 §2.1: "Configuration,
   * user/role, and access-matrix management; **cannot `approve`/`sign`** money, filings, or reserved
   * matters (config authority ≠ governance authority)". The `waqf_access_grant_permission_guard`
   * trigger enforces the same thing independently (any `approve`/`sign` verb on a non-NAZIR role is
   * refused with 42501), so this is a narrowing the database agrees with rather than a promise.
   *
   * `admin:access_matrix:write` is the whole reason the row exists: it is the ONE permission the USER
   * branch of grant admission looks for, and before PO-1 no seeded grant carried it anywhere.
   * `admin:setting:write` is deliberately NOT here — the `admin` preset holds it, but a fee-basis or
   * threshold change is a separate authority the fixture has no scenario for, and a grant may narrow
   * its preset but never widen it (§10 principle 3).
   */
  SYSTEM_ADMIN: {
    permissions: [
      'admin:access_matrix:read',
      'admin:access_matrix:write',
      // Enough context to administer a seat honestly: which endowment this is, and the trail of what
      // was already done to its matrix. Both are `read`.
      'endowment:waqf:read',
      // ⊕ S12-3b (migration 53): the seat that may REGISTER a further endowment for this client. A
      // birth is a record write AND the issuance of the first Nazir seat, so `waqf_birth_admission`
      // demands BOTH verbs on a sibling endowment — and this is the fixture's only holder of the
      // second. Within the `admin` preset (which carries the verb); still no approve, no sign.
      'endowment:waqf:write',
      'audit:event:read',
    ],
    // Empty on purpose. `dataScopes` is stored but NOT enforced anywhere (field-level authorization
    // is unmodelled — `scoping.ts` says so out loud), so a non-empty list here would read as a
    // capability this seat does not actually have.
    dataScopes: [],
    canViewAmlRestricted: false,
    amlCompartment: false,
  },
  /**
   * NEW IN THE S4/E3 CLOSE-OUT (owner decision D-E, 2026-08-16).
   *
   * ⚠ WHY A WHOLE NEW SEAT RATHER THAN A PERMISSION ON AN EXISTING ONE. The owner named three
   * holders of the deed — *"nazir, case manager and elegible beneficiaries"* — and **the fixture had
   * no case_manager at all**: `SEED_USERS` covered admin, nazir ×2, finance, family board, unscoped,
   * beneficiary and matrix-admin, and nothing else. So the second of his three holders could not be
   * granted anything, and §3 row 1's `R W` cell for `case_manager` had no subject to prove it on.
   *
   * ⚠ READ ONLY ON THE DEED, DELIBERATELY. `ROLE_PRESETS.case_manager` DOES hold
   * `endowment:deed:write`, so a wider grant would be legal — but the owner answered READ, and D-E
   * records write as NOT DECIDED. A grant may narrow its preset and never widen it (§10 principle
   * 3), so narrowing is the safe direction and widening later costs nothing; narrowing a live seat
   * later is the risky one (D-5).
   *
   * ⚠ NO `approve`, NO `sign`, ANYWHERE — `waqf_access_grant_permission_guard` refuses either verb
   * on a non-NAZIR role with 42501, so this is a narrowing the DATABASE agrees with rather than a
   * promise this table makes. `legal:reserved_matter:read` is in the preset and is included so the
   * case manager can SEE a reserved matter; `:write` is not in the preset at all, which is §10
   * already agreeing with D-D.
   */
  CASE_MANAGER: {
    permissions: [
      'endowment:waqf:read',
      'endowment:deed:read',
      'endowment:asset:read',
      'beneficiary:beneficiary:read',
      'compliance:task:read',
      'compliance:task:write',
      'legal:reserved_matter:read',
      'document:document:read',
      'approval:request:read',
      'approval:request:initiate',
    ],
    dataScopes: ['beneficiary', 'compliance', 'documents'],
    canViewAmlRestricted: false,
    amlCompartment: false,
  },
  /**
   * ⊕ S11 · 2c — AUDITOR's FIRST seeded shape, for the `/financials` browser journey.
   *
   * WHY A NEW SEAT AT ALL. Every human seat in this fixture is CLAIMED by exactly one spec and TOTP
   * enrolment is a ONE-WAY DOOR (the secret is returned once), so a spec cannot borrow another's seat
   * without making both order-dependent — the rule `kernel.spec.ts:104-112` states and `S11-2` already
   * hit, seeding `compliance@` for the same reason. This is that act's READ-ONLY mirror.
   *
   * WHY AUDITOR. It is one of the locked thirteen (ADR-0004 — no role is invented here), and its
   * preset is SEVENTEEN verbs of which every single one ends in `:read`: there is no write, initiate,
   * sign, approve or execute verb to withhold. `FINANCE` was rejected because its shape carries
   * `finance:transaction:write` AND `distribution:run:initiate`; `CASE_MANAGER` carries no `finance:*`
   * at all; `FAMILY_BOARD` carries only `reporting:report:read`.
   *
   * WHY ONLY TWO OF THE SEVENTEEN. Derived from what the screen CALLS, not from what the role may
   * hold: `finance.summary` is the only endowment-scoped call (`finance:transaction:read`), and
   * `navigation.tree` — which supplies the certificate-number LABEL — filters to `disclosableWaqfIds`,
   * demanding `endowment:waqf:read`. `whoami` is `authedProcedure` and needs nothing.
   *
   * FIFTEEN WITHHELD, and four of them deliberately by name: `beneficiary:beneficiary:read` (the
   * UBO/PII surface — a financial board has no business reaching a family's identity and banking
   * details), `audit:event:read` (the evidence spine), `document:document:read` (E9's vault has its
   * own matrix and retention regime), `legal:case:read` / `legal:reserved_matter:read`. Also withheld:
   * `endowment:deed:read`, `endowment:asset:read`, `finance:bank_account:read`, `distribution:run:read`,
   * `distribution:line_item:read`, `fee:nazir_fee:read`, `compliance:task:read`,
   * `compliance:filing:read`, `reporting:report:read`, `approval:request:read`.
   *
   * ⚠ `finance:bank_account:read` and `distribution:run:read` are NOT withheld as a restriction — they
   * have NO CALLER on this screen: `finance.summary` returns `cashPosition.accounts[]` and the
   * distribution aggregates itself, under its own single verb.
   *
   * ⊕ AND WHY `endowment:waqf:read` IS NOT AN ENLARGEMENT — the lesson this shape exists to record:
   * withholding it would remove the LABEL and not one halala of the DATA. The seat still reads every
   * cash position, receipt total and distribution aggregate on all five endowments with the finance
   * verb alone; an endowment the caller cannot read is ABSENT from the tree rather than
   * present-and-redacted, so the selector would fall back to raw ids and a Nazir would read
   * "waqf-003 · 21,680,000.00" on a screen listing five endowments' money. A NARROWING THAT REMOVES
   * THE LABEL BUT NOT THE DATA IS NOT A NARROWING OF EXPOSURE — IT IS A NARROWING OF UNDERSTANDING,
   * and on a financial surface an unlabelled figure is an invitation to act on the wrong endowment's
   * money. `endowment:waqf:read` is also precisely the verb the product ALREADY uses to decide whether
   * a caller may know an endowment exists (`endowment.get` demands it, `disclosableWaqfIds` keys off
   * it), so granting it follows the disclosure model rather than bending it.
   */
  AUDITOR: {
    permissions: ['finance:transaction:read', 'endowment:waqf:read'],
    dataScopes: ['finance'],
    canViewAmlRestricted: false,
    amlCompartment: false,
  },
  FAMILY_BOARD: {
    permissions: ['reporting:report:read'],
    dataScopes: ['reporting'],
    canViewAmlRestricted: false,
    amlCompartment: false,
  },
  /**
   * ⊕ S12-2 · the reserved-matter clerk's shape — FIVE verbs of the compliance officer's twenty-nine:
   * read the endowment, read/raise an approval request, read/record a reserved matter's chain. No
   * approve, no sign (the Nazir's, ADR-0005), no compliance-register write (that is `user-compliance-001`,
   * the CASE_MANAGER seat, and its journey). `approval:request:read` is what makes the approval ROW
   * visible at all; `approval:request:initiate` is what the write gate on that table demands of any
   * writer (`DOMAIN_WRITE_POLICIES.ApprovalRequest` — any approval verb).
   */
  COMPLIANCE_OFFICER: {
    permissions: [
      'endowment:waqf:read',
      // ⊕ S12-3 · the clerk also carries the V-11 browser journey on waqf-004: it ATTEMPTS an
      // Authority filing (`compliance:filing:write`, refused while Gate 02 is open), CLEARS Gate 02
      // (`endowment:waqf:write`), and attempts again. Eight verbs of twenty-nine; still no approve, no sign.
      'endowment:waqf:write',
      'compliance:filing:read',
      'compliance:filing:write',
      'approval:request:read',
      'approval:request:initiate',
      'legal:reserved_matter:read',
      'legal:reserved_matter:write',
    ],
    dataScopes: ['legal'],
    canViewAmlRestricted: false,
    amlCompartment: false,
  },
  BENEFICIARY: {
    // §3's grid gives `beneficiary` "R self / W self" and `R self` on reporting — and DENIES it any
    // aggregate (`agg`) read. `reporting:statement:read` is the beneficiary-facing artifact;
    // `reporting:report:read` (the aggregate) is deliberately absent.
    //
    // ⚠ THE THIRD HOLDER D-E NAMES IS **HERE NOW** — RULED, NOT ASSUMED. This block used to say the
    // holder was "NOT here, and it is not an oversight": `ROLE_PRESETS.beneficiary` carried no
    // `endowment:*` verb, resolved permissions are `grant ∩ preset` (`narrowPermissions`), so the
    // string would have granted exactly nothing here while breaking `preset-parity.test.ts`. That
    // was true and is kept as the reason the fixture waited.
    //
    // What changed is a DECISION, not an implementation detail: the product owner answered
    // **Q-E4-1 with option (a) on 2026-08-18** (`docs/product/prd/S4-owner-decision-memo.md`, "S5
    // addendum") — *every beneficiary principal of a waqf may read THAT waqf's deed; self-isolation
    // otherwise untouched*, with the consequence named and accepted that a member held behind a
    // living ancestor, or excluded under a line the deed does not continue, reads it too. The
    // preset gained the string in the same change; this list is the FIXTURE half of it.
    //
    // ⚠ AND THE FIXTURE HALF IS NOT COSMETIC — IT IS R6-C1's LESSON, WHICH THIS REPO HAS PAID FOR
    // ONCE ALREADY: *a property whose generator cannot reach a configuration reports its silence as
    // success.* V-E3-L1 was the same shape one layer up (no seeded grant carried `endowment:deed:*`
    // at all, so E3's exit clause was unreachable by every user that existed). Without this line the
    // new door would have exactly zero seeded subjects and every test of it would have to invent
    // its own seat.
    //
    // ⚠ `endowment:deed:read` AND NOT `endowment:waqf:read`. The endowment record — and with it
    // `endowment.get`'s three-field trusteeship SUMMARY, gated on a different string (V-E3-03) —
    // stays invisible to this seat. The ruling opened the deed, not the endowment.
    //
    // ⚠ OWN-WAQF SCOPING IS THIS ROW'S `onlyWaqfId`, NOT THIS LIST. `user-beneficiary-ben-001` is
    // seated on waqf-001 alone, so the grant that carries the string exists on waqf-001 alone and
    // rung 2 answers `NO_GRANT` → NOT_FOUND for waqf-002's deed — which the fixture DOES have, so
    // the refusal is measured non-vacuously
    // (`packages/api/test/beneficiary-deed-read.integration.test.ts`).
    //
    // BR-210 self-isolation and the BR-702 document access matrix: reconciled by the ruling above
    // and by that file, which re-takes the isolation claim on the widened surface rather than
    // inheriting it.
    permissions: [
      'beneficiary:beneficiary:read',
      'endowment:deed:read',
      'reporting:statement:read',
    ],
    dataScopes: ['self'],
    canViewAmlRestricted: false,
    amlCompartment: false,
  },
};

export interface WaqfAccessGrantData {
  readonly userId: string;
  readonly waqfId: string;
  readonly role: RoleValue;
  readonly permissions: readonly string[];
  readonly dataScopes: readonly string[];
  readonly canViewAmlRestricted: boolean;
  readonly amlCompartment: boolean;
  readonly beneficiarySelfId: string | null;
  readonly scopeRefs: readonly string[];
  readonly grantedByUserId: string;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly revokedAt: Date | null;
}

/** [DERIVED] One grant per (granted user × in-scope endowment). `user-unscoped` gets none. */
export function deriveAccessGrants(
  waqfIds: readonly string[],
  validFrom: Date,
): ReadonlyArray<Mapped<WaqfAccessGrantData>> {
  const grants: Array<Mapped<WaqfAccessGrantData>> = [];
  for (const user of SEED_USERS) {
    if (user.grantRole === null) continue;
    // A declared service seat's shape comes from ITS OWN declaration — the ruling's "enumerated
    // minimal permissions", applied where the row is born (S10/T2) — so GRANT_SHAPE_BY_ROLE is
    // deliberately NOT consulted for it: a role-shape entry nobody wears is a claim about a seat
    // that does not exist, and preset-parity narrows the seat's set against ROLE_PRESETS instead.
    // A service seat is never AML-compartmented and never sees restricted rows; making either
    // true would be an owner question, not a seed edit.
    const shape =
      user.serviceSeat === undefined
        ? mapValue(GRANT_SHAPE_BY_ROLE, user.grantRole, 'grant shape for role')
        : {
            permissions: user.serviceSeat.permissions,
            dataScopes: user.serviceSeat.dataScopes,
            canViewAmlRestricted: false,
            amlCompartment: false,
          };
    const targets =
      user.onlyWaqfId === null
        ? waqfIds
        : Array.isArray(user.onlyWaqfId)
          ? [...(user.onlyWaqfId as readonly string[])]
          : [user.onlyWaqfId as string];
    for (const waqfId of targets) {
      grants.push({
        id: derivedId.grant(user.id, waqfId),
        data: {
          userId: user.id,
          waqfId,
          role: user.grantRole,
          permissions: shape.permissions,
          dataScopes: shape.dataScopes,
          canViewAmlRestricted: shape.canViewAmlRestricted,
          amlCompartment: shape.amlCompartment,
          beneficiarySelfId: user.beneficiarySelfId,
          scopeRefs: [],
          grantedByUserId: 'user-seed-admin',
          validFrom,
          validUntil: null,
          revokedAt: null,
        },
      });
    }
  }
  return grants;
}

export interface MembershipData {
  readonly userId: string;
  readonly clientId: string;
  readonly role: RoleValue;
}

/**
 * [DERIVED] Family-level access: the Family Board sees the whole family (all waqifs, all
 * endowments), which is a client-level membership rather than a per-endowment grant.
 */
export function deriveMemberships(clientId: string): ReadonlyArray<Mapped<MembershipData>> {
  return [
    {
      id: derivedId.membership('user-family-board', clientId),
      // ⚠ E2 CHECK `membership_role_family_level_only` restricts this column to `FAMILY_BOARD`.
      // §10 principle 2: "Scope is the endowment, not the client … never per-family." A client-level
      // row that could carry `NAZIR` would mint an approval authority spanning every endowment of
      // the family, with no validity window and no revocation path.
      data: { userId: 'user-family-board', clientId, role: 'FAMILY_BOARD' },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 6. [DERIVED] THE MAKER-CHECKER RECORD BEHIND AN ALREADY-EXECUTED RUN
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface RunApprovalData {
  readonly waqfId: string;
  readonly type: 'DISTRIBUTION_RUN';
  readonly status: 'EXECUTED' | 'APPROVED';
  readonly subjectId: string;
  readonly makerId: string;
  readonly checkerId: string;
  readonly payloadHash: string;
  readonly payload: Record<string, unknown>;
  readonly decidedAt: Date;
  readonly decidedAtHijri: HijriDateString;
  readonly checkerTotpAssertedAt: Date;
}

/**
 * [DERIVED] The `ApprovalRequest` an already-executed fixture run must point at.
 *
 * ── WHY THIS ROW EXISTS, STATED PLAINLY ──────────────────────────────────────────────────────
 * It is NOT a claim about the real engagement, and the fixture does not contain it. E2 makes
 * `Distribution.status IN ('APPROVED','EXECUTED')` with `approvalRequestId IS NULL` unrepresentable
 * at the database, because a paid run with no recorded authority is *worse* than one with a
 * disputed authority: there is nothing to attribute it to, nothing to audit, and the maker-checker
 * invariant is vacuously satisfied. The fixture's `dist-001` is `completed` → `EXECUTED`, so the
 * seed must either produce the authority record or stop being able to seed a historical run. It
 * produces the record and says so here.
 *
 * ── THE MAKER AND THE CHECKER ARE DIFFERENT PEOPLE, AND NEITHER IS ARBITRARY ─────────────────
 * maker   = `user-accountant-001` (FINANCE) — §10 §4.1's initiator for a distribution run.
 * checker = `user-approver-001`   (NAZIR)   — §10 §4.1's required distinct approver is a `nazir`,
 *                                             and this seat's documented purpose is exactly to be
 *                                             a checker distinct from `user-nazir-001`.
 * `checkerId <> makerId` is enforced by CHECK; the checker's ACTIVE `NAZIR` grant on THIS endowment
 * is enforced by the `approval_request_authority` trigger. So this row is only insertable AFTER the
 * grants exist — hence the seed writes it in the append-only step after step 18.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────────────────────────
 * `payloadHash` is computed by the SEED from the derived waterfall using the package's one
 * canonicaliser (`canonicalJson` + `computeHash`), never a second implementation, and every field
 * here is a pure function of fixture values — so the row is byte-reproducible.
 */
export function deriveRunApprovals(
  distributions: ReadonlyArray<Mapped<DistributionData>>,
  hashPayload: (payload: Record<string, unknown>) => string,
): ReadonlyArray<Mapped<RunApprovalData>> {
  const approvals: Array<Mapped<RunApprovalData>> = [];
  for (const { id, data } of distributions) {
    if (data.approvalRequestId === null) continue;

    // The artifact the approver signed: the waterfall as it stood at approval. Strings only —
    // `canonicalJson` THROWS on a JS number, which is what keeps money off this path in float form.
    const payload: Record<string, unknown> = {
      kind: 'DISTRIBUTION_RUN',
      distributionId: id,
      waqfId: data.waqfId,
      periodEnd: data.periodEndHijri,
      grossRevenueSar: data.grossRevenueSar,
      reserveSar: data.reserveSar,
      operatingSar: data.operatingSar,
      nazirFeeSar: data.nazirFeeSar,
      distributableSar: data.distributableSar,
    };

    const decidedAt = data.executedAt ?? data.periodEnd;
    approvals.push({
      id: data.approvalRequestId,
      data: {
        waqfId: data.waqfId,
        type: 'DISTRIBUTION_RUN',
        // The run is EXECUTED, so its approval is spent: EXECUTED is terminal, which also keeps
        // this row OUT of the `approval_request_one_open_per_subject` partial unique index and
        // leaves the open slot free for a live E2/E5 test to use.
        status: data.status === 'EXECUTED' ? 'EXECUTED' : 'APPROVED',
        subjectId: id,
        makerId: 'user-accountant-001',
        checkerId: 'user-approver-001',
        payloadHash: hashPayload(payload),
        payload,
        decidedAt,
        decidedAtHijri: data.executedAtHijri ?? data.periodEndHijri,
        // A recorded step-up assertion (NFR-06). The freshness WINDOW lives in `Setting`; this is
        // only the evidence that one was asserted.
        checkerTotpAssertedAt: decidedAt,
      },
    });
  }
  return approvals;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⊕ S12-3 · THE THREE ONBOARDING GATES PER ENDOWMENT (BR-1101)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export type OnboardingGateKindValue =
  'GATE_01_AUTHORITY_LEGAL' | 'GATE_02_SYSTEMS_CONTROLS' | 'GATE_03_PEOPLE_PROPERTY_CADENCE';

export interface OnboardingGateData {
  readonly waqfId: string;
  readonly gate: OnboardingGateKindValue;
  readonly status: 'OPEN' | 'CLEARED';
  readonly clearedAt: Date | null;
  readonly clearedAtHijri: string | null;
  readonly clearedBy: string | null;
  readonly evidence: Record<string, true> | null;
  readonly note: string | null;
}

const ONBOARDING_GATE_KINDS: readonly OnboardingGateKindValue[] = [
  'GATE_01_AUTHORITY_LEGAL',
  'GATE_02_SYSTEMS_CONTROLS',
  'GATE_03_PEOPLE_PROPERTY_CADENCE',
];

/**
 * Three rows per endowment, in gate order, as the fixture STATES them. A CLEARED gate is attributed to
 * the seed actor and carries the operating model's checklist fully attested — an INVENTED attestation
 * on an invented endowment, stated as such in the fixture's own `_note`. The ORDER is not checked
 * here: the database's `onboarding_gate_order` trigger refuses a later gate cleared over an open
 * earlier one, so a fixture that says so fails to seed rather than being remapped (ADR-0004).
 *
 * `checklist` is `OPERATING_MODEL_GATE_CHECKLIST` from `@qmulate/domain`, passed in by the caller so
 * this module keeps its zero-internal-import property.
 */
export function deriveOnboardingGates(
  fixture: Fixture,
  toHijri: (date: Date) => string,
  checklist: Readonly<Record<OnboardingGateKindValue, readonly string[]>>,
  clearedBy: string,
): ReadonlyArray<Mapped<OnboardingGateData>> {
  const rows: Array<Mapped<OnboardingGateData>> = [];
  for (const waqf of fixture.waqfs) {
    const stated = [
      waqf.onboarding.gate01,
      waqf.onboarding.gate02,
      waqf.onboarding.gate03,
    ] as const;
    ONBOARDING_GATE_KINDS.forEach((gate, index) => {
      const state = stated[index] as { cleared: string | null; _note?: string };
      const cleared = state.cleared === null ? null : new Date(`${state.cleared}T00:00:00.000Z`);
      rows.push({
        id: derivedId.onboardingGate(waqf.id, (index + 1) as 1 | 2 | 3),
        data: {
          waqfId: waqf.id,
          gate,
          status: cleared === null ? 'OPEN' : 'CLEARED',
          clearedAt: cleared,
          clearedAtHijri: cleared === null ? null : toHijri(cleared),
          clearedBy: cleared === null ? null : clearedBy,
          evidence:
            cleared === null
              ? null
              : Object.fromEntries(checklist[gate].map((item) => [item, true as const])),
          note: state._note ?? null,
        },
      });
    });
  }
  return rows;
}
