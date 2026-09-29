// QMULATE — the Shart al-Waqif (شرط الواقف) structured schema, and the fixture → structure mapping.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The Shart al-Waqif is the founder's binding conditions: who benefits, in what order, and under
// what circumstances. It is the distribution engine's BRAIN, and under BINDING RULE 1 it is
// IMMUTABLE — write-once at insert, amendable only through an authority-gated reserved-matter
// workflow with a full audit trail (enforced in the database by the `waqf_shart_immutable`
// trigger, not by application politeness).
//
// The fixture gives us ONE SENTENCE OF ENGLISH PROSE per endowment. Prose is not a condition set.
// So this module does exactly two things and refuses to do a third:
//
//   ✓ ENCODE what the prose (and the deed-derived fixture columns) GENUINELY STATE — the order
//     rule, which generational tiers and lines actually exist, the disbursement channel implied
//     by the waqf's own deed-set type, and the deed-set Nazir fee where the fixture records one.
//   ✓ MARK AS EXPLICITLY ABSENT everything the prose does NOT state — the maintenance-reserve
//     rule, the absolute share basis, the charitable/family split, the disbursement schedule.
//   ✗ NEVER INVENT a condition to make a future distribution run succeed.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE LOAD-BEARING DISTINCTION: `unspecified` ≠ `none`, and `missing` ≠ `advisory`
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `maintenanceReserve: { kind: "unspecified" }` means "the deed is silent / we do not know".
// `maintenanceReserve: { kind: "none" }` means "the deed positively stipulates no reserve".
// Collapsing the first into the second would be the software silently deciding a fiqh question,
// so the schema keeps them as different values and the seed only ever writes `unspecified`.
//
// `completeness.missing`  → HALTING. The distribution engine must refuse to compute and return
//                           `SHART_INCOMPLETE`. It never guesses, defaults, or infers the
//                           founder's intent (Binding rule 1); resolution goes to the
//                           condition-interpretation path (living waqif, else the competent
//                           authority), never to code.
// `completeness.advisory` → NON-HALTING. The run proceeds and the flag is surfaced in the UI and
//                           in the distribution's `computationTrace`.
//
// ⚠ ORCHESTRATOR / CONTRACT NOTE: the E1 contract places `shartAlWaqifSchema` in
// `@qmulate/domain/shart` so the seed and the future engine share ONE definition. That package
// is not in this agent's file set, so the schema is defined here, self-contained and with zero
// internal imports, precisely so it can be MOVED verbatim into `@qmulate/domain/src/shart/schema.ts`
// and re-exported from here as a one-line change. Do not let two definitions exist.

import { z } from 'zod';
import type { FixtureBeneficiary, FixtureNazirFee, FixtureWaqf } from './fixture-schema.js';

/**
 * Money inside the Shart JSON is a fixed-scale decimal STRING, never a JS number.
 * (§17 DoD: JS `number` is banned for money end-to-end, and `canonicalJSON` throws on one.)
 */
const decimalString = z
  .string()
  .regex(/^\d+\.\d{1,2}$/, 'money must be a fixed-scale decimal string, e.g. "40000.00"');

/**
 * lineage continuation (LINEAGE_CONTINUATION) · al-aʿlā fa-l-aʿlā (ORDERED) · tashrīk (SHARED) ·
 * direct use of the asset (NA_DIRECT_USE).
 *
 * ⚠ `LINEAGE_CONTINUATION` IS THE FOURTH, AND IT IS THE **NORMAL** ONE (ADR-0009 R4, S4/E3). It is
 * listed first for that reason: entitlement follows descent, per capita over the LIVING FRONTIER of
 * each line, and `ORDERED` is the OPT-IN EXCEPTION rather than the default. Landed in
 * `EntitlementOrder` by migration 12, which is what emptied the parity test's declared delta.
 */
export const shartOrderRules = [
  'LINEAGE_CONTINUATION',
  'ORDERED',
  'SHARED',
  'NA_DIRECT_USE',
] as const;

/** Generational lines: ẓuhūr / buṭūn / not-applicable. */
export const shartLines = ['ZUHUR', 'BUTUN', 'NA'] as const;

/**
 * Which of the waqif's lines the DEED continues — a CLOSED two-value term (ADR-0009 R2).
 *
 * `null` on the Shart's own field means the deed states none, which is legitimate for a خيري or a
 * direct-use endowment and is a HALTING gap on a `LINEAGE_CONTINUATION` deed
 * (`CONTINUATION_STIPULATION_UNRECOGNISED` at the engine). There is deliberately no third value and
 * no default: "unknown" is the ABSENCE of a value, never a value.
 */
export const shartContinuationStipulations = ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const;

/** مآل الوقف — the recognised readings of the reversion clause. One today (R7). */
export const shartReversionKinds = ['CHARITABLE_ULTIMATE_TAKER'] as const;

/**
 * HALTING gaps. Any of these present in `completeness.missing` ⇒ the engine returns
 * `SHART_INCOMPLETE` and computes nothing.
 */
export const shartMissingCodes = [
  'ORDER_RULE',
  'TIER_DEFINITIONS',
  'CHARITABLE_FAMILY_SPLIT',
  'DISBURSEMENT_CHANNEL',
  /**
   * ⚠ ADDED S4/E3. A `LINEAGE_CONTINUATION` deed with no continuation stipulation cannot be
   * computed at all: which lines continue decides the HEAD COUNT, and under the engine's own worked
   * example the same 780,000.00 pays 6 heads at 13,000.00 under `ZUHUR_ONLY` and 8 at 9,750.00 under
   * `ZUHUR_AND_BUTUN` — a 25% cut to every surviving beneficiary from one deed field. HALTING.
   */
  'CONTINUATION_STIPULATION',
  /**
   * ⚠ ADDED S4/E3, and it is the gap that did not previously EXIST as a state. The deed's مآل clause
   * has not been read, so "there is no ultimate taker" cannot be asserted and cannot be denied.
   * HALTING at the mapping boundary rather than at the engine: the engine's `reversion` input is
   * two-state (`null` = the deed records none), so an unread clause has no representation there at
   * all and must never be passed off as `null`.
   */
  'REVERSION_CLAUSE_UNREAD',
] as const;

/** NON-HALTING gaps. The engine proceeds and raises a flag. */
export const shartAdvisoryCodes = [
  'MAINTENANCE_RESERVE_UNSPECIFIED',
  'TIER_WEIGHTS_NOT_STIPULATED',
  'NAZIR_FEE_BASIS_UNSPECIFIED',
  'FAMILY_BRANCH_SPLIT_UNSPECIFIED',
  'DISBURSEMENT_SCHEDULE_SILENT_STATUTORY_DEFAULT',
] as const;

const maintenanceReserveSchema = z.discriminatedUnion('kind', [
  /** The deed positively stipulates NO reserve. */
  z.object({ kind: z.literal('none') }).strict(),
  /** A stipulated fixed ṣiyāna amount, reserved before anything else. */
  z.object({ kind: z.literal('fixed'), amountSar: decimalString }).strict(),
  /** A stipulated percentage of the period's income (0–1 rate, matching §08 `Percent01`). */
  z.object({ kind: z.literal('percent'), rate: z.number().min(0).max(1) }).strict(),
  /** Top the reserve fund up to a target balance. */
  z.object({ kind: z.literal('target_topup'), targetBalanceSar: decimalString }).strict(),
  /** THE DEED IS SILENT / UNKNOWN. Never conflate with `none`. */
  z.object({ kind: z.literal('unspecified') }).strict(),
]);

/**
 * **مآل الوقف** inside the Shart JSON (R7, product owner 2026-08-10).
 *
 * ⚠ THREE STATES, AND THE THIRD IS THE ONE THAT DID NOT EXIST BEFORE S4:
 *
 *   `{ status: 'unread' }`      nobody has read this deed's مآل clause yet. The mapper must REFUSE
 *                              to build a distribution run input from such a waqf — a caller-side
 *                              refusal, NOT a new engine discriminator.
 *   `{ status: 'none' }`        the deed POSITIVELY records no ultimate taker. A statement, not an
 *                              omission (R7-c), and the engine's `reversion: null`.
 *   `{ status: 'named', … }`    the deed names ultimate-taker beneficiaries.
 *
 * `unread` and `none` are kept strictly apart for exactly the reason `maintenanceReserve`'s
 * `unspecified` and `none` are: collapsing them would let an un-transcribed deed masquerade as a
 * deed that names nobody, and "where does this endowment go when the family ends?" is not a
 * question code may answer by default (binding rule 6).
 */
const reversionClauseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unread') }).strict(),
  z.object({ status: z.literal('none') }).strict(),
  z
    .object({
      status: z.literal('named'),
      kind: z.enum(shartReversionKinds),
      /** Beneficiary ids of THIS endowment. Never deduplicated — a repeat MOVES MONEY. */
      ultimateTakerIds: z.array(z.string().min(1)).min(1),
      /** Frozen Umm-al-Qura snapshot of when the clause was recorded (convention 2). */
      recordedAtHijri: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
]);

export const shartAlWaqifSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** The `Document` holding the deed text, for provenance. Null until the deed is vaulted. */
    sourceDocumentId: z.string().nullable(),
    /** NON-AUTHORITATIVE prose. Present for humans; the engine never reads it. */
    narrativeAr: z.string().nullable(),
    narrativeEn: z.string().nullable(),
    orderRule: z.enum(shartOrderRules),
    /**
     * Which lines the deed continues. `null` = the deed states none — legitimate on a خيري or
     * direct-use endowment, and a HALTING gap (`CONTINUATION_STIPULATION`) on a lineage deed.
     * ⚠ NO DEFAULT. Which lines a founder continued is a fiqh reading of the deed.
     */
    continuationStipulation: z.enum(shartContinuationStipulations).nullable(),
    /** مآل الوقف — see {@link reversionClauseSchema}. Required key; three states, no default. */
    reversion: reversionClauseSchema,
    tiers: z.array(
      z
        .object({
          tabaqa: z.number().int().positive(),
          labelAr: z.string().min(1),
          labelEn: z.string().optional(),
          lines: z.array(z.enum(shartLines)).min(1),
          /**
           * The deed's OWN absolute weight for this tier. Null means the deed does not stipulate
           * one — the engine then renormalizes the roster's relative `Beneficiary.sharePercent`
           * values within the entitled cohort. Null is a fact, not a default.
           */
          stipulatedWeight: z.number().nonnegative().nullable(),
        })
        .strict(),
    ),
    maintenanceReserve: maintenanceReserveSchema,
    /** masraf al-rei / مصرف الريع — where the yield is directed. */
    disbursementChannel: z
      .object({
        kind: z.enum(['FAMILY', 'CHARITABLE', 'MIXED', 'DIRECT_USE', 'UNSPECIFIED']),
        familySharePercent: z.number().min(0).max(100).nullable(),
        charitableSharePercent: z.number().min(0).max(100).nullable(),
        charitablePurposeAr: z.string().nullable(),
      })
      .strict(),
    disbursementSchedule: z.enum(['ANNUAL', 'QUARTERLY', 'CUSTOM', 'UNSPECIFIED']),
    nazirFee: z
      .object({
        basis: z.enum(['PERCENT_OF_REVENUE', 'PERCENT_OF_NET_INCOME', 'RETAINER', 'UNSPECIFIED']),
        /** ⚠ unverified — confirm vs primary law. Deed-set (ʿushr), never a statutory rate. */
        ratePercent: z.number().min(0).max(100).nullable(),
        amountSar: decimalString.nullable(),
      })
      .strict(),
    nazarahSuccession: z
      .object({
        specified: z.boolean(),
        /** Arabic-authoritative when present. */
        ruleAr: z.string().nullable(),
      })
      .strict(),
    completeness: z
      .object({
        status: z.enum(['COMPLETE', 'INCOMPLETE']),
        missing: z.array(z.enum(shartMissingCodes)),
        advisory: z.array(z.enum(shartAdvisoryCodes)),
      })
      .strict(),
  })
  .strict();

export type ShartAlWaqif = z.infer<typeof shartAlWaqifSchema>;
export type ShartMissingCode = (typeof shartMissingCodes)[number];
export type ShartAdvisoryCode = (typeof shartAdvisoryCodes)[number];

// ═══════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE → STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════════════════

const ORDER_RULE_BY_FIXTURE_VALUE = {
  lineage_continuation: 'LINEAGE_CONTINUATION',
  ordered: 'ORDERED',
  shared: 'SHARED',
  'n/a (direct use of the asset)': 'NA_DIRECT_USE',
} as const satisfies Record<string, (typeof shartOrderRules)[number]>;

const CONTINUATION_BY_FIXTURE_VALUE = {
  zuhur_only: 'ZUHUR_ONLY',
  zuhur_and_butun: 'ZUHUR_AND_BUTUN',
} as const satisfies Record<string, (typeof shartContinuationStipulations)[number]>;

const REVERSION_KIND_BY_FIXTURE_VALUE = {
  charitable_ultimate_taker: 'CHARITABLE_ULTIMATE_TAKER',
} as const satisfies Record<string, (typeof shartReversionKinds)[number]>;

const LINE_BY_FIXTURE_VALUE = {
  zuhur: 'ZUHUR',
  butun: 'BUTUN',
  'n/a': 'NA',
} as const satisfies Record<string, (typeof shartLines)[number]>;

/**
 * The disbursement channel follows the waqf's deed-set TYPE — khayrī / ahlī-dhurrī / mushtarak
 * is itself a statement of where the yield goes, so this is reading the deed, not guessing.
 */
const CHANNEL_BY_WAQF_TYPE = {
  public_charitable: 'CHARITABLE',
  family_dhurri: 'FAMILY',
  joint: 'MIXED',
} as const satisfies Record<string, ShartAlWaqif['disbursementChannel']['kind']>;

/** The deed-set disbursement-schedule vocabulary, as the fixture spells it (S5/E4). */
const SCHEDULE_BY_FIXTURE_VALUE = {
  annual: 'ANNUAL',
  quarterly: 'QUARTERLY',
  custom: 'CUSTOM',
} as const satisfies Record<string, ShartAlWaqif['disbursementSchedule']>;

/** The deed-set fee basis vocabulary, as the fixture spells it. */
const SHART_FEE_BASIS_BY_FIXTURE_VALUE = {
  percent_of_revenue: 'PERCENT_OF_REVENUE',
  percent_of_net_income: 'PERCENT_OF_NET_INCOME',
  retainer: 'RETAINER',
} as const satisfies Record<string, ShartAlWaqif['nazirFee']['basis']>;

const TIER_LABEL_AR: Readonly<Record<number, string>> = {
  1: 'الطبقة الأولى',
  2: 'الطبقة الثانية',
  3: 'الطبقة الثالثة',
  4: 'الطبقة الرابعة',
};

const TIER_LABEL_EN: Readonly<Record<number, string>> = {
  1: 'First tier',
  2: 'Second tier',
  3: 'Third tier',
  4: 'Fourth tier',
};

/**
 * The one place a nazarah-succession rule is genuinely stated in the fixture prose.
 *
 * waqf-001's summary says the Nazarah runs to the waqif for life and then to the most upright of
 * his descendants. That IS a stipulated succession rule, so it is recorded — in Arabic, because
 * the Shart is an Arabic-authoritative legal instrument. No other fixture endowment states one,
 * and none is invented for them.
 */
const NAZARAH_SUCCESSION_AR_BY_WAQF: Readonly<Record<string, string>> = {
  'waqf-001': 'النظارة للواقف مدة حياته ثم للأصلح من ذريته',
};

/**
 * A fixture money NUMBER → the fixed-scale `"40000.00"` string {@link decimalString} demands.
 *
 * ⚠ NOT `toFixed` (banned: it rounds a float that has already lost precision) and NOT a Decimal
 * import (this module keeps ZERO internal imports — see the header). Integer arithmetic is exact
 * here because `fixture-schema.ts`'s `fixtureMoney` has ALREADY refused any value that is not
 * exactly representable at 2 decimal places, so `n * 100` rounds to the true minor-unit integer.
 */
function fixedScaleSar(n: number): string {
  const minor = Math.round(n * 100);
  return `${String(Math.trunc(minor / 100))}.${String(minor % 100).padStart(2, '0')}`;
}

function lookupOrThrow<T>(map: Readonly<Record<string, T>>, key: string, what: string): T {
  const value = map[key];
  if (value === undefined) {
    throw new Error(`Unmapped ${what} value in fixture: ${JSON.stringify(key)}`);
  }
  return value;
}

/**
 * Derive the tier structure from the beneficiary ROSTER.
 *
 * TODO(surface): FIQH/DATA-PROVENANCE — tiers here are inferred from which `tabaqa`/`line`
 * combinations appear in the beneficiary roster, because the fixture carries no deed text with
 * tier definitions. The roster is EVIDENCE OF the deed's tiers, not the deed itself, and it is
 * incomplete by construction (no waqf's `sharePercent`s sum to 100). `stipulatedWeight` is
 * therefore always null: the deed's absolute allocation is genuinely unknown. Confirm with
 * counsel whether a roster-derived tier structure is an acceptable stand-in for the deed's own
 * tier definitions, or whether an endowment without a parsed deed must halt outright.
 */
function deriveTiers(beneficiaries: readonly FixtureBeneficiary[]): ShartAlWaqif['tiers'] {
  const linesByTabaqa = new Map<number, Set<(typeof shartLines)[number]>>();
  for (const beneficiary of beneficiaries) {
    if (beneficiary.tabaqa === null) continue; // a charitable jiha sits outside the tier ladder
    const line = lookupOrThrow(LINE_BY_FIXTURE_VALUE, beneficiary.line, 'beneficiary line');
    if (line === 'NA') continue;
    const set = linesByTabaqa.get(beneficiary.tabaqa) ?? new Set();
    set.add(line);
    linesByTabaqa.set(beneficiary.tabaqa, set);
  }
  return [...linesByTabaqa.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tabaqa, lines]) => ({
      tabaqa,
      labelAr: TIER_LABEL_AR[tabaqa] ?? `الطبقة رقم ${tabaqa}`,
      labelEn: TIER_LABEL_EN[tabaqa] ?? `Tier ${tabaqa}`,
      // Sorted so the JSON is byte-identical run to run (seed determinism → stable audit hash).
      lines: [...lines].sort(),
      stipulatedWeight: null,
    }));
}

/**
 * Completeness is COMPUTED FROM THE STRUCTURE by these rules — never hand-assigned per endowment.
 * A rule can be reviewed; a hand-written verdict cannot.
 *
 * HALTING (`missing`):
 *   ORDER_RULE              — no order rule could be read from the deed.
 *   TIER_DEFINITIONS        — the yield has a FAMILY component but no tier structure exists to
 *                             allocate it across; there is literally nobody the engine can pay.
 *   CHARITABLE_FAMILY_SPLIT — a MIXED channel whose split is not recorded, or does not total 100.
 *   DISBURSEMENT_CHANNEL    — the deed does not say where the yield goes at all.
 *
 * ADVISORY (non-halting):
 *   MAINTENANCE_RESERVE_UNSPECIFIED  — §08's stated default for a silent deed is "no reserve",
 *                                      but that default is itself unconfirmed (see the TODO below).
 *   TIER_WEIGHTS_NOT_STIPULATED      — weights come from the roster, renormalized in-cohort.
 *   NAZIR_FEE_BASIS_UNSPECIFIED      — §08 raises AUTHORITY_FEE_DETERMINATION_PENDING.
 *   FAMILY_BRANCH_SPLIT_UNSPECIFIED  — a family slice exists with no branch structure recorded.
 *   DISBURSEMENT_SCHEDULE_SILENT_STATUTORY_DEFAULT — falls back to the statutory 3-months-post-FYE
 *                                      window, which lives in `Setting`, not in code.
 *
 * TODO(surface): FIQH — is a SILENT maintenance-reserve stipulation really non-halting? §08 says
 * default to none; an alternative reading is a prudential minimum, and a third is to halt with
 * SHART_INCOMPLETE. The structure preserves the distinction either way, so flipping this rule is
 * a one-line change once the question is answered. NOT resolved here.
 */
export function computeCompleteness(
  draft: Omit<ShartAlWaqif, 'completeness'>,
): ShartAlWaqif['completeness'] {
  const missing: ShartMissingCode[] = [];
  const advisory: ShartAdvisoryCode[] = [];

  const channel = draft.disbursementChannel;
  const hasFamilySlice = channel.kind === 'FAMILY' || channel.kind === 'MIXED';

  if (channel.kind === 'UNSPECIFIED') missing.push('DISBURSEMENT_CHANNEL');
  if (hasFamilySlice && draft.tiers.length === 0) missing.push('TIER_DEFINITIONS');

  // ⚠ HALTING, AND ONLY ON A LINEAGE DEED. `continuationStipulation` decides the HEAD COUNT under
  // `LINEAGE_CONTINUATION`, so its absence there is unresolvable by code (ADR-0009 R2). On an
  // `ORDERED`, `SHARED` or `NA_DIRECT_USE` deed a null is a legitimate recorded fact — those orders
  // do not read it — so it is NOT flagged. Order-gated rather than blanket, deliberately: flagging
  // it everywhere would make three-quarters of the fixture INCOMPLETE for a term their rule ignores.
  if (draft.orderRule === 'LINEAGE_CONTINUATION' && draft.continuationStipulation === null) {
    missing.push('CONTINUATION_STIPULATION');
  }

  // ⚠ HALTING ON EVERY ORDER, INCLUDING DIRECT USE. An unread مآل clause is not a gap in the
  // distribution rule — it is a gap in the deed's transcription, and it is the one state that must
  // never be quietly passed to the engine as "the deed records none" (R7-c, binding rule 6).
  if (draft.reversion.status === 'unread') missing.push('REVERSION_CLAUSE_UNREAD');
  if (channel.kind === 'MIXED') {
    const family = channel.familySharePercent;
    const charitable = channel.charitableSharePercent;
    if (family === null || charitable === null || Math.abs(family + charitable - 100) > 1e-9) {
      missing.push('CHARITABLE_FAMILY_SPLIT');
    }
  }

  if (draft.maintenanceReserve.kind === 'unspecified')
    advisory.push('MAINTENANCE_RESERVE_UNSPECIFIED');
  if (draft.tiers.length > 0 && draft.tiers.some((tier) => tier.stipulatedWeight === null)) {
    advisory.push('TIER_WEIGHTS_NOT_STIPULATED');
  }
  if (draft.nazirFee.basis === 'UNSPECIFIED') advisory.push('NAZIR_FEE_BASIS_UNSPECIFIED');
  if (hasFamilySlice && draft.tiers.length === 0) advisory.push('FAMILY_BRANCH_SPLIT_UNSPECIFIED');
  if (draft.disbursementSchedule === 'UNSPECIFIED') {
    advisory.push('DISBURSEMENT_SCHEDULE_SILENT_STATUTORY_DEFAULT');
  }

  return {
    status: missing.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
    missing,
    advisory,
  };
}

/**
 * Build the structured `shartAlWaqif` JSON for one fixture endowment.
 *
 * WHAT IS GENUINELY MISSING FROM THE FIXTURE — stated, never invented:
 *   (a) any stipulated maintenance-reserve rule, for any endowment. The fixture's `exp-e-001` is a
 *       maintenance EXPENSE ALREADY PAID; an expense is not a stipulated reserve rule.
 *   (b) the deed's absolute tier/line weights. The roster's `sharePercent`s are relative and sum
 *       to 37.5% / 50% / 40% — never 100%.
 *   (c) waqf-003's split between the charitable and family slices, and the family slice's
 *       allocation across branches. This one HALTS.
 *   (d) any disbursement schedule, anywhere.
 *   (e) the Nazir-fee basis for waqf-002 / waqf-003 / waqf-004.
 */
export function buildShartAlWaqif(
  waqf: FixtureWaqf,
  beneficiaries: readonly FixtureBeneficiary[],
  nazirFee: FixtureNazirFee | undefined,
  /**
   * The frozen Umm-al-Qura snapshot of `waqf.reversionClauseCapturedDate`, computed by the caller —
   * the day somebody READ this deed's مآل clause. (It was `waqf.reversion.recordedDate` until the
   * S4/E3 round-2 close-out; the date belongs to the READING, not to what the reading found — AV-1.)
   * Required whenever the deed NAMES an ultimate taker; ignored otherwise. Passed in rather than
   * derived so this module keeps its zero-internal-import property (see the header).
   */
  reversionRecordedAtHijri: string | null = null,
): ShartAlWaqif {
  const namesAnUltimateTaker = waqf.reversionClauseCaptured && waqf.reversion !== null;
  if (
    namesAnUltimateTaker &&
    (reversionRecordedAtHijri === null || reversionRecordedAtHijri === '')
  ) {
    throw new Error(
      `buildShartAlWaqif(${waqf.id}): the deed names an ultimate taker but no Hijri snapshot of ` +
        'its recorded date was supplied. Every legally-significant date in this schema is DUAL ' +
        "(convention 2), and the provenance of a founder's condition is not an exception.",
    );
  }
  // Narrowed once, here, so the `named` branch below cannot be reached with a null snapshot. The
  // check above is what makes this assertion true rather than assumed.
  const recordedAtHijri: string = namesAnUltimateTaker ? (reversionRecordedAtHijri as string) : '';
  // ⚠ TWO SOURCES FOR ONE FACT, KEPT HONEST (S5/E4). The deed's fee term lives on the waqf
  // (`waqf.nazirFee`); `nazirFees[]` records fee EVENTS (invoices). Where both exist they must
  // agree — a fee event under a deed term it contradicts is fixture drift, not a rounding story.
  // An event under a SILENT deed is legitimate (an Authority-determined fee is still invoiced),
  // so only the both-exist case is checked.
  if (nazirFee !== undefined && waqf.nazirFee !== null) {
    if (nazirFee.basis !== waqf.nazirFee.basis || nazirFee.percent !== waqf.nazirFee.percent) {
      throw new Error(
        `buildShartAlWaqif(${waqf.id}): the deed's fee term (${waqf.nazirFee.basis} ` +
          `${String(waqf.nazirFee.percent)}) disagrees with fee event ${nazirFee.id} ` +
          `(${nazirFee.basis} ${String(nazirFee.percent)}). Two sources for one fact must agree ` +
          'or the fixture is drift.',
      );
    }
  }
  const orderRule = lookupOrThrow(
    ORDER_RULE_BY_FIXTURE_VALUE,
    waqf.entitlementOrder,
    'waqf entitlementOrder',
  );
  const channelKind =
    orderRule === 'NA_DIRECT_USE'
      ? ('DIRECT_USE' as const)
      : lookupOrThrow(CHANNEL_BY_WAQF_TYPE, waqf.type, 'waqf type');

  const draft: Omit<ShartAlWaqif, 'completeness'> = {
    schemaVersion: 1,
    // No deed document is vaulted by the fixture seed, so provenance is honestly null.
    sourceDocumentId: null,
    // The fixture carries no Arabic. The English prose is recorded as NON-AUTHORITATIVE narrative;
    // it is never the thing the engine reads.
    narrativeAr: null,
    narrativeEn: waqf.waqifConditionSummary,
    orderRule,
    // [FIXTURE] A RECORDED deed term since S4/E3, never inferred from the prose and never defaulted.
    // `null` means the deed continues no particular line, which the fixture states explicitly for
    // the joint and direct-use endowments rather than leaving the key out.
    continuationStipulation:
      waqf.continuationStipulation === null
        ? null
        : lookupOrThrow(
            CONTINUATION_BY_FIXTURE_VALUE,
            waqf.continuationStipulation,
            'waqf continuationStipulation',
          ),
    // [FIXTURE] مآل الوقف. The THREE states are kept apart: `unread` (nobody has read the clause)
    // halts at the mapping boundary, `none` is the deed's own positive statement, `named` carries
    // the ids. Conflating the first two is what a nullable column alone would have done.
    reversion: !waqf.reversionClauseCaptured
      ? { status: 'unread' as const }
      : waqf.reversion === null
        ? { status: 'none' as const }
        : {
            status: 'named' as const,
            kind: lookupOrThrow(
              REVERSION_KIND_BY_FIXTURE_VALUE,
              waqf.reversion.kind,
              'waqf reversion kind',
            ),
            ultimateTakerIds: [...waqf.reversion.ultimateTakerIds],
            // SUPPLIED BY THE CALLER, not computed here: this module deliberately keeps ZERO
            // internal imports so it can be moved verbatim into `@qmulate/domain/shart` (see the
            // header — and note that `schema.prisma` claimed the move had already happened until S4
            // corrected the comment). Reaching for `./hijri.js` would give it its first one.
            recordedAtHijri,
          },
    tiers: orderRule === 'NA_DIRECT_USE' ? [] : deriveTiers(beneficiaries),
    // (a) A RECORDED deed term since S5/E4 (`waqf.maintenanceRule`, FIXTURE_DELTA_REQUIRED paid
    // down). `null` still means the deed is silent/unread — 'unspecified', never 'none'. The old
    // comment ("NOT STATED anywhere in the fixture") described the pre-S5 fixture and is retired
    // because the fixture now states it; the RULE-vs-EXPENSE distinction stands (exp-e-001 is a
    // paid cost, never this).
    maintenanceReserve:
      waqf.maintenanceRule === null
        ? { kind: 'unspecified' }
        : waqf.maintenanceRule.basis === 'none'
          ? { kind: 'none' }
          : waqf.maintenanceRule.basis === 'fixed'
            ? { kind: 'fixed', amountSar: fixedScaleSar(waqf.maintenanceRule.amountSar) }
            : { kind: 'percent', rate: waqf.maintenanceRule.percent / 100 },
    disbursementChannel: {
      kind: channelKind,
      // (c) NOT STATED. waqf-003's prose says "per fixed shares" without recording the shares.
      //
      // DELIBERATE DEVIATION from E1 contract §D2, which derives 40/60 from ben-006's roster
      // `sharePercent`. A roster row is not a deed condition: inferring the founder's split from
      // one beneficiary's recorded share is exactly the guess Binding rule 1 forbids. Both
      // percentages stay null, `CHARITABLE_FAMILY_SPLIT` lands in `missing`, and waqf-003's Shart
      // is INCOMPLETE — so the engine will correctly halt with SHART_INCOMPLETE instead of paying
      // out against an inferred split. Flipping this back is a two-line change if Product/Counsel
      // decide the inference is acceptable.
      familySharePercent: null,
      charitableSharePercent: null,
      // The prose says "charitable causes" generically and names no jiha or purpose.
      charitablePurposeAr: null,
    },
    // (d) A RECORDED deed term since S5/E4 (`waqf.disbursementSchedule`). `null` = no schedule
    // set — the recorded fact that makes the statutory post-FY-end window bind (it lives in
    // `Setting`, never here).
    disbursementSchedule:
      waqf.disbursementSchedule === null
        ? 'UNSPECIFIED'
        : lookupOrThrow(SCHEDULE_BY_FIXTURE_VALUE, waqf.disbursementSchedule, 'waqf schedule'),
    nazirFee:
      // (e) A RECORDED deed term since S5/E4 (`waqf.nazirFee`). `null` = THE DEED IS SILENT — the
      // recorded fact behind AUTHORITY_FEE_DETERMINATION_PENDING (waqf-002's deliberate case).
      // ⚠ The `nazirFees[]` array records fee EVENTS (invoices); until S5 it doubled as the deed's
      // basis, which put a deed term in a ledger row. The coherence check below keeps the two
      // sources honest where both exist.
      waqf.nazirFee === null
        ? { basis: 'UNSPECIFIED', ratePercent: null, amountSar: null }
        : {
            // ⚠ unverified — confirm vs primary law. Deed-set ʿushr (10% of revenue) per the
            // fixture's own `source: "waqf_deed (customary ushr) — not a regulatory rate"`. This
            // is NOT the Awqaf Law Art. 14 ≤10%-of-NET-INCOME Authority fee — different payee,
            // different base. That one is seeded separately as a `Setting`.
            basis: lookupOrThrow(
              SHART_FEE_BASIS_BY_FIXTURE_VALUE,
              waqf.nazirFee.basis,
              'nazirFee basis',
            ),
            ratePercent: waqf.nazirFee.percent,
            amountSar: null,
          },
    nazarahSuccession: {
      specified: NAZARAH_SUCCESSION_AR_BY_WAQF[waqf.id] !== undefined,
      ruleAr: NAZARAH_SUCCESSION_AR_BY_WAQF[waqf.id] ?? null,
    },
  };

  const shart: ShartAlWaqif = { ...draft, completeness: computeCompleteness(draft) };

  // Validate on the way out: a Shart that does not satisfy its own schema must never be written,
  // because it can never be corrected by a normal UPDATE afterwards (the immutability trigger).
  return shartAlWaqifSchema.parse(shart);
}
