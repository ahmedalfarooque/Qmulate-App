/**
 * `classification` — BR-104: the endowment's regulatory class, WITH HISTORY, and the obligations that
 * follow from it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THIS IS THE FIRST HALF OF THE E3 EXIT CLAUSE, AND THE CLAUSE IS ABOUT A CONTRAST
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §17's E3 exit reads: "the fixture's MEDIUM waqf shows audited-statement/bylaw obligations that the
 * SMALL waqf does not." A contrast can pass VACUOUSLY — over an empty catalogue, or over a matrix that
 * returns everything for everyone — so it is proven at three layers, and this file is the third:
 *   1. `packages/domain`'s own suite drives all 16 `ClassificationGate × WaqfClassification` cells,
 *      plus a negative control;
 *   2. `packages/database`'s seed suite asserts the catalogue actually CONTAINS a LARGE_MEDIUM-gated
 *      audited-statement obligation and internal-bylaws obligation — without which layer 3 asserts
 *      over an empty set;
 *   3. {@link classificationRouter.applicableObligations} returns both codes for the MEDIUM endowment
 *      and NEITHER for the SMALL one, with each appearing in the SMALL endowment's `excluded` list.
 *
 * ⚠ `excluded` IS RETURNED ALONGSIDE `obligations` FOR EXACTLY THAT REASON. Without it the medium/small
 * contrast is "one list is shorter", which is satisfied by an empty catalogue and by a broken query
 * alike. With it, one call proves the obligation EXISTS, was CONSIDERED, and was excluded BECAUSE of
 * this endowment's class.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE BANDS ARE `Setting` ROWS AND CARRY THEIR CAVEAT, ALWAYS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE SAR 200M / 50M FIGURES ARE UNVERIFIED against primary Saudi law (Binding rule 3). They live in
 * `Setting['classification.threshold.large.sar' | 'classification.threshold.medium.sar']` and are
 * returned as resolved ENVELOPES — value, unit, `unverified`, and the ⚠ note — so a UI physically
 * cannot render the figure without the marker in hand. They are never hardcoded here and never
 * presented as settled.
 *
 * ⚠ AND THIS MODULE DOES NOT COMPUTE THE BAND. `reclassify` takes the target class as an INPUT and
 * records who decided it and why. Deriving a classification from the asset valuations would put an
 * unverified threshold in the arithmetic path of a regulatory obligation, and a valuation edit would
 * then silently move an endowment between classes with no reclassification event at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS SURFACED, NOT DECIDED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TODO(surface): §10 §4.1 has NO ROW for a re-classification, so S4 ships `reclassify` on the MAKER
 * rung (`endowment:waqf:write`, held by nazir / authorized_rep / case_manager / compliance_officer /
 * admin). A re-classification changes which statutory duties apply to the endowment, which is
 * arguably a governance act needing the Nazir's `A*`. That is an owner call and S4 must not take it
 * silently in either direction; widening later is safe, narrowing a live guard is not (D-5).
 */

import { z } from 'zod';

import { recordEvent, withReservedMatter, type ExtendedPrismaClient } from '@qmulate/database';
// ⚠ THE SUBPATH, matching `./dates` and `./distribution`. Not one cell of the 16-cell
// `ClassificationGate × WaqfClassification` matrix is restated in this file: a second copy in the
// transport layer is how the medium/small contrast comes to pass at one layer and fail at another.
import {
  CLASSIFICATION_BAND_SETTING_KEYS as DOMAIN_BAND_SETTING_KEYS,
  REGISTER_LOCK_REASON,
  isWaqfClassification,
  obligationsForClassification,
  type GatedObligation,
  type WaqfClassification,
} from '@qmulate/domain/classification';
import {
  RETURN_TO_NOT_CLASSIFIED_RETIREMENT_REASON,
  planReturnToNotClassified,
} from '@qmulate/domain/compliance';
import { SETTING_KEYS, type SettingKey } from '@qmulate/domain';

import { ApiError } from '../errors.js';
import { toActorContext } from '../context.js';
import { HIJRI_SNAPSHOT_PATTERN, assertHijriPairAgrees } from '../dual-date.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import { createSettingResolver } from '../settings.js';
import { endowmentScopedProcedure, makerProcedure, router } from '../trpc.js';
// ⊕ E7-completion — the §09 task diff (A3/A4) shares ONE implementation with
// `compliance.instantiateRegister`, so what a reclassification retires can never disagree with
// what setup instantiated.
import {
  INCOME_FACT_BASIS,
  hasIncomeAtInstant,
  planReclassificationTaskDiff,
} from './compliance.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Vocabulary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `WaqfClassification`, as a zod enum.
 *
 * Spelled here rather than imported from the generated Prisma client on purpose: `packages/api`'s UNIT
 * suite must run with no generated client at all (see `test/setup.ts`), and a static import of the
 * datamodel would break that. The spelling is compared against the datamodel by
 * `packages/domain`'s parity test, which reads `schema.prisma` as text — so a drift is caught there
 * rather than by a second copy here that nothing checks.
 */
// ⚠ ⊕ S8-Q4: `NOT_CLASSIFIED` is DELIBERATELY ABSENT from this input enum, and the omission is the
// guard. This schema types `reclassify.to`, and the ruling's onboarding state has ONE exit —
// recording the real classification — and no entrance by transition: a recorded determination is
// never revoked back into its absence. Migration 34 refuses the same transition at the database
// (`waqf_no_unclassify` + the reclassification `to`-check), so this is defence at the transport
// layer, not the control itself. The full five-member vocabulary lives in `WAQF_CLASSIFICATIONS`;
// this narrower list is the set of classes a transition may TARGET.
/**
 * ⊕ S9-4a — THREE size bands (owner ruling, fifth batch). `DIRECT_UTILIZATION` is no longer a
 * classification a caller may record, because it is not a size; the usage axis is
 * `Waqf.directUtilization` and is recorded separately.
 *
 * ⚠ A caller still sending the old value now gets a ZOD REFUSAL naming the accepted set, which is
 * the wire-level form of ADR-0004's "refuse, never remap" — the alternative (silently accepting it
 * and storing SMALL) would put a size determination nobody made into the column that gates this
 * endowment's statutory duties.
 */
const waqfClassificationInput = z.enum(['LARGE', 'MEDIUM', 'SMALL']);

/**
 * The two `Setting` keys holding the bands — **IMPORTED, NOT LISTED.**
 *
 * `@qmulate/domain/classification` declares them, `@qmulate/domain`'s `SETTING_SCHEMAS` registers them
 * and `packages/database/src/seed/settings.ts` seeds them. A hand-written list here would be a fourth
 * copy of two strings, and the failure mode is silent: a renamed key would resolve to `SETTING_MISSING`
 * on one code path while the other kept reporting a figure.
 *
 * ⚠ THE FIGURES THEMSELVES ARE UNVERIFIED against primary Saudi law (Binding rule 3) and are never
 * hardcoded anywhere — `get` returns the resolved ENVELOPES, caveat included.
 */
export const CLASSIFICATION_BAND_SETTING_KEYS: readonly string[] = DOMAIN_BAND_SETTING_KEYS;

/** The marker every regulatory figure this router returns must carry (Binding rule 3). */
export const UNVERIFIED_MARKER = '⚠ unverified — confirm against primary law' as const;

/**
 * The recorded classification, narrowed — or a REFUSAL.
 *
 * ⚠ FAIL CLOSED. A `Waqf.classification` value that is not a recognised member cannot be gated, and the
 * two wrong answers are (a) treat it as the lightest class, which silently removes duties, and (b) treat
 * it as the heaviest, which invents them. Both are worse than refusing, and neither would be visible in
 * a screen. The Prisma enum makes this unreachable through the ORM; it is reachable through a raw
 * `UPDATE`, which is exactly the path a guard has to survive.
 */
function requireRecordedClassification(waqfId: string, value: unknown): WaqfClassification {
  if (!isWaqfClassification(value)) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `waqf ${waqfId} records classification ${JSON.stringify(String(value))}, which is not a ` +
        `recognised WaqfClassification. REFUSED rather than gated: treating an unreadable class as the ` +
        `lightest silently removes regulatory duties and treating it as the heaviest invents them ` +
        `(BR-104).`,
      { waqfId, recorded: String(value) },
    );
  }
  return value;
}

/**
 * The band keys, narrowed to the `Setting` registry AT IMPORT.
 *
 * ⚠ IT IS A CHECK, NOT A CAST, AND THE DIFFERENCE MATTERS. `resolver.resolve()` demands a REGISTERED
 * `SettingKey`; a key that the classification module names but `SETTING_SCHEMAS` does not register would
 * throw `SETTING_MISSING` at request time — a silent outage that reads like an unconfigured figure and
 * invites someone to "fix" it by adding a fallback, which is how a fail-closed check becomes fail-open.
 * Filtering against `SETTING_KEYS` here turns that into a loud failure at boot and in every test run.
 */
const BAND_SETTING_KEYS: readonly SettingKey[] = (() => {
  const registered = new Set<string>(SETTING_KEYS);
  const unregistered = CLASSIFICATION_BAND_SETTING_KEYS.filter((key) => !registered.has(key));
  if (unregistered.length > 0) {
    throw new Error(
      `classification router: band Setting key(s) ${unregistered.join(', ')} are named by ` +
        `@qmulate/domain/classification but are NOT in SETTING_SCHEMAS. They would resolve to ` +
        `SETTING_MISSING at request time. Register and seed them, or fix the name — never add a ` +
        `fallback, because an unverified regulatory band with a hardcoded default is exactly what ` +
        `Binding rule 3 forbids.`,
    );
  }
  return CLASSIFICATION_BAND_SETTING_KEYS as readonly SettingKey[];
})();

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The obligation catalogue, gated
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The GLOBAL obligation template library.
 *
 * `ComplianceObligation` is deliberately UNSCOPED (`UNSCOPED_MODELS`: "Global obligation TEMPLATE
 * library seeded from the regulation. Instances are ComplianceTask, which IS scoped."). The catalogue
 * is the REGULATION's, not an endowment's — every Nazir is subject to the same articles — so reading it
 * whole is correct and discloses nothing about any family.
 *
 * The task INSTANCES and their statuses are E7's. This procedure answers "which duties apply", never
 * "which are done".
 */
const OBLIGATION_SELECT = {
  code: true,
  section: true,
  workstreamAr: true,
  workstreamEn: true,
  titleAr: true,
  titleEn: true,
  gate: true,
  deadlineRuleKey: true,
} as const;

/**
 * A Prisma catalogue row → the pure module's structural input.
 *
 * `gate` and `section` cross as STRINGS, deliberately — `@qmulate/domain` imports nothing internal, and
 * an unrecognised gate must reach the resolver as DATA so it can be REPORTED rather than becoming a
 * shape error or, far worse, being silently treated as "does not apply". A regulatory obligation
 * vanishing from an endowment's register because a catalogue row was mis-typed is the exact failure the
 * `unrecognisedGate` bucket exists to make impossible.
 */
function toGatedObligation(row: {
  code: string;
  section: unknown;
  workstreamAr: string;
  workstreamEn: string;
  titleAr: string;
  titleEn: string;
  gate: unknown;
  deadlineRuleKey: string | null;
}): GatedObligation {
  return {
    code: row.code,
    section: String(row.section),
    workstreamAr: row.workstreamAr,
    workstreamEn: row.workstreamEn,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    gate: String(row.gate),
    // The WINDOW is never stored on the obligation — it resolves from
    // `Setting['deadline.<ruleKey>.businessDays' | '.months']`, which is what makes a correction a
    // config change rather than a deploy.
    deadlineRuleKey: row.deadlineRuleKey,
  };
}

/**
 * Refuses when the catalogue contains a row whose `gate` is not a recognised member.
 *
 * ⚠ THE PURE MODULE SURFACES THESE AS DATA AND SAYS "THE CALLER MUST REFUSE", so this is that refusal.
 * Folding them into `excluded` would mean an unreadable gate silently removes a duty from a compliance
 * register; reporting them and continuing would mean a screen that looks complete while a duty is
 * missing. Every bad row is named at once rather than one per round trip.
 */
function assertEveryGateRecognised(
  waqfId: string,
  unrecognised: readonly { code: string; recordedGate: string }[],
): void {
  if (unrecognised.length === 0) return;
  throw new ApiError(
    'GATE_NOT_CLEARED',
    `the ComplianceObligation catalogue contains ${unrecognised.length} row(s) whose classification ` +
      `gate is not a recognised member: ` +
      `${unrecognised.map((row) => `${row.code} (gate=${JSON.stringify(row.recordedGate)})`).join(', ')}. ` +
      `REFUSED rather than answered: an unreadable gate treated as "does not apply" is a regulatory ` +
      `obligation disappearing from an endowment's register with nothing anywhere saying so (BR-104). ` +
      `Fix the catalogue row.`,
    { waqfId, unrecognised: unrecognised.map((row) => row.code) },
  );
}

/**
 * Refuses when the catalogue contains a row on a RETIRED gate (S8-Q3).
 *
 * ⚠ A SEPARATE REFUSAL FROM THE ONE ABOVE, with a separate message, because they are separate facts.
 * `GATE_NOT_CLEARED` on an unrecognised gate says *somebody mis-typed a catalogue row*. This says
 * *this row was written against a rule the product no longer has* — the owner retired `LARGE_ONLY` on
 * 2026-08-23 (S8-Q3, refused-not-remapped). A Nazir reading the first message would go looking for a
 * typo that is not there.
 */
function assertNoRetiredGate(
  waqfId: string,
  retired: readonly { code: string; retiredGateValue: string; liveGates: readonly string[] }[],
): void {
  if (retired.length === 0) return;
  throw new ApiError(
    'GATE_NOT_CLEARED',
    `the ComplianceObligation catalogue contains ${retired.length} row(s) on a RETIRED classification ` +
      `gate: ${retired.map((row) => `${row.code} (gate=${JSON.stringify(row.retiredGateValue)})`).join(', ')}. ` +
      `This is NOT a typo — the gate is a recognised member that the product owner retired (S8-Q3, ` +
      `2026-08-23), refused rather than remapped so an old record still reads. REFUSED rather than ` +
      `answered, for the same reason as an unreadable gate: treating it as "does not apply" removes a ` +
      `regulatory obligation from an endowment's register with nothing saying so (BR-104). Re-gate the ` +
      `row to one still in service: ${retired[0]?.liveGates.join(', ') ?? ''}.`,
    { waqfId, retired: retired.map((row) => row.code) },
  );
}

/**
 * ⊖ **`assertNoIncomeFactMissing` WAS HERE, AND IT WAS REMOVED ON 2026-08-23 WHEN ITS DEBT CAME DUE.**
 *
 * It threw `GATE_NOT_CLEARED` whenever a `HAS_INCOME` row could not be decided. Its own docstring
 * named the day it would fire — *"once the obligation library is seeded … Today the seeded catalogue
 * contains no `HAS_INCOME` row, so this path is latent"* — and the seeding stage is that day.
 *
 * **MEASURED THE MOMENT THE CANONICAL LIBRARY LANDED**, on a fresh cluster, against the real fixture:
 * `classification.applicableObligations` and `classification.reclassify` **both refused, for every
 * endowment**, naming `FIN-ACC-02, FIN-ACC-04, FIN-ZKT-01, OPS-LEASE-01`. Four api integration tests
 * went red — including BR-104's re-classification, which is the E3 exit clause. A compliance officer
 * asking *"what does this endowment owe?"* received **nothing at all**, and a Nazir could not
 * re-classify an endowment.
 *
 * ── WHY REPORTING IS THE HONEST SHAPE AND REFUSING WAS NOT ──────────────────────────────────
 * The refusal conflated two states that are not alike, and the two surviving asserts above are the
 * contrast:
 *
 *  · `unrecognisedGate` / `retiredGate` are **DEFECTS IN THE DATA**. Somebody mis-typed a catalogue
 *    row, or wrote one against a rule the product retired. Nobody can answer the question until a row
 *    is fixed, and treating such a row as "does not apply" deletes a duty silently. Those still
 *    REFUSE, and nothing here weakens them.
 *  · `incomeFactMissing` is **NOT a defect**. It is the correct, expected, designed state for a
 *    caller with no period to consult — `@qmulate/domain`'s resolver says so in terms: the parameter
 *    is optional precisely so *"a caller that has no ledger to consult (a setup screen, a catalogue
 *    preview) legitimately cannot supply it … every `HAS_INCOME` row then lands in `incomeFactMissing`
 *    instead of being decided."* The api turned that REPORT into an OUTAGE.
 *
 * ⚠ **AND THAT IS THIS SPRINT'S OWN LESSON FOR THE THIRD TIME: a fail-closed control that DENIES THE
 * ENTITLED PARTY.** Q2 refused a Nazir the force filter would have admitted; Q1 hid a compartment from
 * its own members; this refused a compliance officer the forty-two duties it could answer perfectly
 * well. All three were written as safety and all three are outages, and all three were invisible while
 * their universe was empty.
 *
 * ── WHAT REPLACES IT, AND WHAT IS STILL NOT INVENTED ────────────────────────────────────────
 * The undecidable rows are RETURNED, in their own field, named, each carrying the fact it needs. The
 * caller gets the 42 rows the class decides, plus an explicit *"these four cannot be decided without a
 * period"* — which is strictly more information than a refusal and strictly less invention than a
 * default. **Nothing defaults the ledger fact**: `false` would silently drop the duty to record
 * revenue and expenses in Arabic (NFR-01), `true` would tell a moneyless endowment it owes a bank
 * reconciliation, and neither appears anywhere in this file.
 *
 * ⊕ **STILL OWED, AND NOW WITH A LIVE SUBJECT RATHER THAN A LATENT ONE:** a register read that WANTS
 * those four decided must supply a period, and *which period a register answers for* is a product
 * question, not an engineering one (binding rule 4 — surfaced with the seeding stage). E8 owns the
 * deadline period; `apps/web`'s `ClassificationPanel` does not render this field yet and the ar/en copy
 * for *"needs a period"* is product-approved text this change may not write (E10/E12).
 */
/**
 * ⊕ S8-Q4 — what a LOCKED register's response says, and what it deliberately does not.
 *
 * A2 (§09): *"Given an endowment with no classification set, When the register is opened, Then it
 * is locked with a 'set classification first' prompt and no tasks are materialised."* The LOCK is
 * the domain resolver's (`registerLocked: true`, every list empty — a refusal to partition, not an
 * empty register); this note is the API's statement of it, in the same register as
 * {@link INCOME_FACT_NOTE}: an engineering-voice English explanation for a developer reading the
 * payload. ⚠ The user-facing "set classification first" PROMPT is product-approved ar/en copy this
 * layer may not write (E10/E12) — `ClassificationPanel` owes that rendering, and until it lands
 * the panel must not read the empty `obligations` list as "nothing owed".
 */
const REGISTER_LOCK_NOTE =
  'This endowment is NOT_CLASSIFIED: the compliance register is LOCKED and no partition was ' +
  'computed (S8-Q4). The empty lists mean "not yet askable", never "nothing owed" — an excluded ' +
  'verdict is a determination the absence of a classification cannot make. Record the real ' +
  'classification via classification.reclassify to open the register; no tasks instantiate until ' +
  'then.';

const INCOME_FACT_NOTE =
  "§09's `has_income` gate applies where the endowment records revenue or expense IN A PERIOD. This " +
  'endpoint answers a question about the recorded CLASS and has no period, so these obligations are ' +
  'reported as UNDECIDED rather than defaulted: false silently drops the duty to record revenue and ' +
  'expenses in Arabic (NFR-01), and true tells an endowment with no money that it owes a bank ' +
  'reconciliation. Supply a period to decide them.';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The router
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⊕ S9-4a — read the endowment's USAGE AXIS (ذات انتفاع مباشر).
 *
 * ⚠ Returns `null` when unrecorded and NEVER coerces it. The owner's ruling is explicit — *"an
 * endowment whose usage is unrecorded is UNRECORDED, not 'not direct'"* — and
 * `obligationsForClassification` reports such rows in `directUseFactMissing` rather than deciding
 * them. A `?? false` here would be the single line that undoes the whole separation of the two axes.
 */
async function readDirectUtilization(
  db: ExtendedPrismaClient,
  waqfId: string,
): Promise<boolean | null> {
  const waqf = await db.waqf.findFirst({
    where: { id: waqfId, deletedAt: null },
    select: { directUtilization: true },
  });
  return waqf?.directUtilization ?? null;
}

export const classificationRouter = router({
  /**
   * The current class, the bands it was judged against, and the FULL ordered history.
   *
   * The history is read, never rewritten: `reclassification_event_no_update`,
   * `reclassification_event_no_mutate` and `reclassification_event_no_truncate` (migrations 6 and 12)
   * refuse UPDATE, DELETE and TRUNCATE with SQLSTATE 42501, and
   * `reclassification_event_from_matches_current` refuses an INSERT whose `from` is not the
   * endowment's current class. Before S4 the model's doc comment claimed "append-only, never edited"
   * and NOTHING enforced it.
   */
  get: endowmentScopedProcedure('endowment:waqf:read').query(async ({ ctx }) => {
    const waqf = await ctx.db.waqf.findFirst({
      where: { id: ctx.waqfId },
      select: { classification: true },
    });
    if (waqf === null) {
      throw new ApiError(
        'NO_GRANT',
        `waqf ${ctx.waqfId} is not visible through this caller's own client. Surfaced as NOT_FOUND so ` +
          `the endowment's existence is not disclosed (§10 §7.2).`,
        { waqfId: ctx.waqfId },
      );
    }

    const history = await ctx.db.reclassificationEvent.findMany({
      where: { waqfId: ctx.waqfId },
      select: { from: true, to: true, at: true, atHijri: true, reason: true, createdBy: true },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
    });

    // Resolved ENVELOPES, not bare numbers. `resolve()` returns `unverified` and the ⚠ note with the
    // value, and `parseSetting`'s refinement means an unverified figure cannot even be STORED without
    // its marker — so there is no path by which a UI receives the band without the caveat.
    const resolver = createSettingResolver(ctx.db, { now: ctx.now });
    const bands = await Promise.all(
      BAND_SETTING_KEYS.map(async (key) => {
        const resolved = await resolver.resolve(key, { waqfId: ctx.waqfId });
        return {
          key: resolved.key,
          tier: resolved.tier,
          // The whole envelope: `{ v, unit, unverified, note }`.
          value: resolved.envelope,
        };
      }),
    );

    return {
      current: requireRecordedClassification(ctx.waqfId, waqf.classification),
      bands: {
        settingKeys: [...CLASSIFICATION_BAND_SETTING_KEYS],
        resolved: bands,
        unverified: true as const,
        note: UNVERIFIED_MARKER,
      },
      history: history.map((event) => ({
        from: String(event.from),
        to: String(event.to),
        at: event.at.toISOString(),
        atHijri: event.atHijri,
        reason: event.reason,
        createdBy: event.createdBy,
      })),
    };
  }),

  /**
   * Which regulatory duties apply to THIS endowment's recorded class — and which do not, and why.
   *
   * The gating decision is `@qmulate/domain`'s `obligationsForClassification(gate, classification)`,
   * over the closed `ClassificationGate × WaqfClassification` matrix. This file does not restate a
   * single cell of it: a second copy of the matrix in the transport layer is how the medium/small
   * contrast would come to pass at one layer and fail at another.
   */
  applicableObligations: endowmentScopedProcedure('endowment:waqf:read').query(async ({ ctx }) => {
    const waqf = await ctx.db.waqf.findFirst({
      where: { id: ctx.waqfId },
      select: { classification: true },
    });
    if (waqf === null) {
      throw new ApiError(
        'NO_GRANT',
        `waqf ${ctx.waqfId} is not visible through this caller's own client. Surfaced as NOT_FOUND so ` +
          `the endowment's existence is not disclosed (§10 §7.2).`,
        { waqfId: ctx.waqfId },
      );
    }
    const classification = requireRecordedClassification(ctx.waqfId, waqf.classification);

    const catalogue = await ctx.db.complianceObligation.findMany({
      select: OBLIGATION_SELECT,
      orderBy: { code: 'asc' },
    });

    // ONE call into the pure resolver. It partitions the catalogue into `obligations` / `excluded` /
    // `unrecognisedGate` and carries the ⚠ notes and the band provenance with the answer.
    const gated = obligationsForClassification({
      classification,
      catalogue: catalogue.map(toGatedObligation),
      // ⊕ S9-4a — the usage axis. `null` when unrecorded, and the resolver then REPORTS the
      // usage-sensitive rows in `directUseFactMissing` rather than deciding them.
      directUtilization: await readDirectUtilization(ctx.db, ctx.waqfId),
    });
    assertEveryGateRecognised(ctx.waqfId, gated.unrecognisedGate);
    assertNoRetiredGate(ctx.waqfId, gated.retiredGate);

    // ⊕ S8-Q4 — the LOCK is a RESPONSE, not a refusal, and that is this sprint's lesson applied in
    // advance rather than discovered as outage #4: an unclassified endowment is a real onboarding
    // state, and a caller asking about it is ENTITLED to learn "the register is locked, record the
    // classification" rather than receiving an error. The two asserts above ran first on purpose —
    // they are trivially satisfied by the locked result's empty buckets today, and keeping them
    // ahead of this branch means a future resolver change cannot slip a defective catalogue past
    // them behind the lock.
    if (gated.registerLocked) {
      return {
        classification: gated.classification,
        registerLocked: true as const,
        registerLockReason: REGISTER_LOCK_REASON,
        registerLockNote: REGISTER_LOCK_NOTE,
        obligations: gated.obligations,
        excluded: gated.excluded,
        incomeFactMissing: gated.incomeFactMissing,
        incomeFactNote: INCOME_FACT_NOTE,
        unverifiedNotes: [...gated.unverifiedNotes],
        bandSettingKeys: [...gated.bandSettingKeys],
      };
    }

    return {
      classification: gated.classification,
      registerLocked: false as const,
      obligations: gated.obligations,
      /**
       * ⚠ RETURNED ALONGSIDE `obligations`, and that is what makes the medium-vs-small contrast
       * PROVABLE in one call rather than merely observable as "one list is shorter" — a property an
       * empty catalogue and a broken query both satisfy. Every entry carries
       * `GATE_EXCLUDES_CLASSIFICATION`, the single reason gating can exclude anything.
       */
      excluded: gated.excluded,
      /**
       * ⊕ S8 — the rows the CLASS cannot decide, reported rather than refused.
       *
       * Neither applicable nor excluded: §09 gates these on the LEDGER (`has_income`), and this
       * endpoint has no period. Returning them keeps the answer TOTAL — every catalogue row is in
       * exactly one of the three lists — which is what lets a caller show "42 apply, 4 need a
       * period" instead of either hiding four duties or receiving nothing at all.
       *
       * ⚠ A caller that renders `obligations` and ignores this field shows a register that is
       * QUIETLY INCOMPLETE. `apps/web`'s `ClassificationPanel` does exactly that today, because the
       * ar/en wording for it is product-approved copy this layer may not write (E10/E12).
       */
      incomeFactMissing: gated.incomeFactMissing,
      incomeFactNote: INCOME_FACT_NOTE,
      unverifiedNotes: [...gated.unverifiedNotes],
      bandSettingKeys: [...gated.bandSettingKeys],
    };
  }),

  /**
   * Re-classify, appending the BR-104 history event in the SAME transaction.
   *
   * ── ORDER IS LOAD-BEARING AND THE DATABASE ENFORCES IT ────────────────────────────────────
   * The `ReclassificationEvent` is inserted FIRST, while `waqf.classification` still holds the
   * pre-image, because `reclassification_event_from_matches_current` compares `NEW."from"` against the
   * endowment's CURRENT class. Updating the waqf first makes the insert fail — which is the guard
   * working, and its message says so.
   *
   * `from` is therefore never a caller input: it is read from the row inside the transaction. A
   * caller-supplied `from` is how a fabricated transition records a compliance position that never
   * existed and can never be corrected.
   *
   * ── AND NEITHER IS `atHijri`, ANY MORE (V-E3-M1) ──────────────────────────────────────────
   * The regex below proves the SHAPE of the Hijri half and nothing about its VALUE. Until S4's
   * close-out, `at = 2026-08-13` with `atHijri = 1300-01-01` — a ~700-year discrepancy — was
   * ACCEPTED and written into this append-only, regulator-facing history, where UPDATE, DELETE and
   * TRUNCATE are all refused, so it could never be corrected. {@link assertHijriPairAgrees} now
   * derives the snapshot server-side through the single Hijri implementation (ADR-0007) and refuses
   * a mismatch; the value STORED is the server's, never the caller's.
   */
  reclassify: makerProcedure('endowment:waqf:write')
    .input(
      z.object({
        to: waqfClassificationInput,
        reason: z.string().min(1).max(2048),
        at: z.string().datetime(),
        atHijri: z
          .string()
          .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ── THE DUAL DATE, PROVEN BEFORE ANYTHING ELSE IS READ (V-E3-M1) ───────────────────────
      // First statement in the body on purpose: this row is APPEND-ONLY, so the only moment a wrong
      // pair can be stopped is before it is written. `atHijri` from here on is the SERVER's value.
      const at = new Date(input.at);
      const atHijri = assertHijriPairAgrees(at, input.atHijri, 'at', 'atHijri');

      const before = await ctx.db.waqf.findFirst({
        where: { id: ctx.waqfId },
        select: { classification: true },
      });
      if (before === null) {
        throw new ApiError(
          'NO_GRANT',
          `waqf ${ctx.waqfId} is not visible through this caller's own client, so it cannot be ` +
            `re-classified. Surfaced as NOT_FOUND (§10 §7.2).`,
          { waqfId: ctx.waqfId },
        );
      }
      const from = requireRecordedClassification(ctx.waqfId, before.classification);

      if (from === input.to) {
        // The database refuses this too (`"from" and "to" are both %`). Refusing here as well means
        // nothing is written and rolled back, and the caller gets a reason instead of a SQLSTATE.
        throw new ApiError(
          'PERMISSION_DENIED',
          `waqf ${ctx.waqfId} is already ${from}: an event with no transition in it dilutes the ` +
            `history it is supposed to be evidence of (BR-104). Refused rather than appended.`,
          { waqfId: ctx.waqfId, from, to: input.to },
        );
      }

      // ── THE OBLIGATION DELTA, FROM THE SAME RESOLVER THE READ PATH USES ────────────────────
      // Two calls, one implementation. The delta is the BR-104 point made visible: a re-classification
      // changes WHICH regulatory duties apply, and a response that reported only "MEDIUM → LARGE" would
      // leave the consequence to be discovered later.
      const catalogue = (
        await ctx.db.complianceObligation.findMany({
          select: OBLIGATION_SELECT,
          orderBy: { code: 'asc' },
        })
      ).map(toGatedObligation);

      // ⊕ E7-completion — RECLASSIFY CONSULTS THE LEDGER. The read endpoints stay period-less and
      // report ledger-gated rows undecided; a re-classification is an ACT at an instant, its task
      // diff (below) must decide those rows to instantiate or retire honestly, and a delta that
      // said "undecided" beside a diff that DECIDED would be two answers to one question in one
      // response. Same basis as `compliance.instantiateRegister`, declared on the wire and in the
      // trail (INCOME_FACT_BASIS); with the fact supplied on BOTH sides, §09's income-conditional
      // cell (`SMALL_DIRECT` @ `DIRECT_UTILIZATION`, the A6 clause) makes a DIRECT-involving move
      // report the simplified-statement duty as genuinely gained or lost.
      const hasIncome = await hasIncomeAtInstant(ctx.db as never, ctx.waqfId);

      // ⊕ S9-4a — THE USAGE AXIS TRAVELS WITH BOTH SIDES OF THE DELTA. It is a fact about the
      // endowment and does NOT change across a reclassification, so the same value is passed to
      // both: a delta computed with the attribute on one side only would attribute a usage-driven
      // gate change to the size change that did not cause it.
      const directUtilization = await readDirectUtilization(ctx.db, ctx.waqfId);
      const gatedBefore = obligationsForClassification({
        classification: from,
        catalogue,
        hasIncomeInPeriod: hasIncome,
        directUtilization,
      });
      const gatedAfter = obligationsForClassification({
        classification: input.to,
        catalogue,
        hasIncomeInPeriod: hasIncome,
        directUtilization,
      });
      // Refused on BOTH sides: an unreadable gate makes the delta wrong in one direction or the other,
      // and a half-computed delta is worse than a refusal because it looks authoritative.
      assertEveryGateRecognised(ctx.waqfId, gatedBefore.unrecognisedGate);
      assertEveryGateRecognised(ctx.waqfId, gatedAfter.unrecognisedGate);
      assertNoRetiredGate(ctx.waqfId, gatedBefore.retiredGate);
      assertNoRetiredGate(ctx.waqfId, gatedAfter.retiredGate);

      // ⊕ S8 — LEDGER-GATED ROWS ARE OUTSIDE THE DELTA, AND THE DELTA SAYS SO.
      // They are identical on both sides of a re-classification by construction: `has_income` does
      // not consult the class at all, so such a row can be neither gained nor lost by moving MEDIUM →
      // LARGE. Reporting them keeps the response honest about what the delta does NOT cover, which
      // matters because the delta is what tells a Nazir the consequence of the act they are about to
      // authorise. ⚠ Computed from the AFTER side and asserted equal to the BEFORE side, so a future
      // resolver change that made them class-dependent cannot slip through unnoticed.
      // ⊕ S8-Q4 — THE LIVENESS EXCEPTION, stated with the ruling rather than found as an outage.
      // When `from` is NOT_CLASSIFIED the before side is a LOCKED register: it reported NOTHING —
      // not the ledger-gated rows, not anything — so the invariance check below would compare the
      // after side's `has_income` rows against a deliberate silence and REFUSE the one transition
      // that is the lock's only exit. The invariant it protects ("`has_income` does not consult
      // the class") is not violated by the lock; it was simply never asked. Skipped for exactly
      // that one shape, and only that one — between two REAL classes the check stands untouched.
      // ⊕ E7-completion — with the ledger fact now supplied to both sides, BOTH lists are empty
      // whenever the fact computation above ran, so this assert's live job is catching a future
      // edit that drops the fact from one side. ⚠ It could no longer be stated over ALL undecided
      // rows anyway: §09's income-conditional cell (`SMALL_DIRECT` @ `DIRECT_UTILIZATION`) is
      // class-DEPENDENT by design, so a fact-less DIRECT-involving delta legitimately differs
      // across sides — the fact being supplied is what keeps the old invariant meaningful.
      const incomeFactUndecided = gatedAfter.incomeFactMissing.map((row) => row.code);
      if (
        !gatedBefore.registerLocked &&
        JSON.stringify(incomeFactUndecided) !==
          JSON.stringify(gatedBefore.incomeFactMissing.map((row) => row.code))
      )
        throw new ApiError(
          'GATE_NOT_CLEARED',
          `the set of ledger-gated obligations differs between ${from} and ${input.to}, which the ` +
            `\`has_income\` gate cannot do — it does not consult the classification. Refused rather ` +
            `than reported, because a delta computed over a shifting denominator is wrong in a way ` +
            `nobody would see.`,
          { waqfId: ctx.waqfId, incomeFactUndecided },
        );

      const codesBefore = new Set(gatedBefore.obligations.map((row) => row.code));
      const codesAfter = new Set(gatedAfter.obligations.map((row) => row.code));
      const obligationsGained = gatedAfter.obligations.filter((row) => !codesBefore.has(row.code));
      const obligationsLost = gatedBefore.obligations.filter((row) => !codesAfter.has(row.code));

      // ⊕ E7-completion — §09's TASK diff (A3/A4), planned by the shared engine. `null` means the
      // register was never engine-instantiated (a pre-engine endowment: the fixture's hand-seeded
      // rows): §09's clauses diff a GENERATED register, so nothing is created or retired and the
      // response says so — reporting the delta of duties is still correct either way.
      const taskDiff = await planReclassificationTaskDiff(
        ctx.db as never,
        ctx.waqfId,
        { from, to: input.to },
        hasIncome,
        directUtilization,
      );

      return auditedWrite(ctx.db, async (tx) => {
        // (a) THE HISTORY FIRST. `from` is the pre-image read above and re-proved by the BEFORE INSERT
        //     trigger against the live row — two sides, and the database owns the deciding one.
        const event = await tx.reclassificationEvent.create({
          data: {
            waqfId: ctx.waqfId,
            from: from as never,
            to: input.to as never,
            at,
            atHijri,
            reason: input.reason,
            createdBy: ctx.actor.actorId,
          },
          // A `create` MAY project: no pre-image ⇒ no diff ⇒ an omitted column is simply not
          // reported, never falsely reported as null.
          select: { id: true, waqfId: true, from: true, to: true, at: true },
        });

        // (b) THEN THE COLUMN. ⚠ NO `select` — the audit extension diffs this result against a
        //     full-row pre-image and reads an absent key as null (C-08).
        await tx.waqf.update({
          where: { id: ctx.waqfId },
          data: { classification: input.to as never },
        });

        // (b′) ⊕ E7-completion — THE TASK DIFF, in the SAME transaction as the classification
        //      change and its history event, so A3's "the whole delta is one correlated audit
        //      event" is a transaction property, not a convention. Newly-out-of-scope open tasks
        //      retire with §09's own reason string and `retiredAt = at` (the transition instant);
        //      newly-in-scope templates instantiate with reason RECLASSIFICATION. Retired rows
        //      are KEPT — `compliance_task_retirement_terminal` (migration 36) makes un-retiring
        //      impossible, so A4's "previously-retired copies remain queryable as history" holds
        //      by construction.
        const tasksInstantiated: { id: string; templateCode: string }[] = [];
        const tasksRetired: { id: string; templateCode: string }[] = [];
        if (taskDiff !== null) {
          for (const retirement of taskDiff.plan.retire) {
            await tx.complianceTask.update({
              where: { id: retirement.taskId },
              data: {
                status: 'RETIRED',
                retiredReason: retirement.retiredReason,
                retiredAt: at,
              },
            });
            tasksRetired.push({ id: retirement.taskId, templateCode: retirement.templateCode });
          }
          for (const task of taskDiff.plan.instantiate) {
            // Non-null: the planner's TEMPLATE_FACTS_MISSING refusal proves every code resolves.
            const obligation = taskDiff.obligationIdByCode.get(task.templateCode) as {
              id: string;
              confidentiality: string;
            };
            const row = await tx.complianceTask.create({
              data: {
                waqfId: ctx.waqfId,
                obligationId: obligation.id,
                templateCode: task.templateCode,
                templateVersion: task.templateVersion,
                confidentiality: obligation.confidentiality as never,
                status: 'NOT_STARTED',
                classificationAtInstantiation: task.classificationAtInstantiation as never,
                instantiatedReason: task.instantiatedReason as never,
                createdBy: ctx.actor.actorId,
              },
              select: { id: true, templateCode: true },
            });
            tasksInstantiated.push(row);
          }
        }

        // (c) THE POINT OF BR-104, in the trail: a re-classification changes which regulatory duties
        //     apply. The extension's own diff records `classification: MEDIUM -> LARGE` and cannot
        //     express THAT, so the delta is recorded here — with the ⚠ caveat, because the bands the
        //     decision rests on are unverified against primary Saudi law.
        await recordEvent(toActorContext(ctx, { procedure: 'classification.reclassify' }), {
          action: 'UPDATE',
          category: 'MUTATION',
          classification: 'SENSITIVE',
          entityType: 'ReclassificationEvent',
          entityId: event.id,
          waqfId: ctx.waqfId,
          extraContext: {
            from,
            to: input.to,
            atHijri,
            obligationsGained: obligationsGained.map((row) => row.code),
            obligationsLost: obligationsLost.map((row) => row.code),
            // ⊕ E7-completion — the TASK half of BR-104's "with history", in the same correlated
            // event as the duty delta (A3). `taskDiffApplied: false` = a pre-engine register:
            // nothing was created or retired, and a reader must not take the empty lists as
            // "nothing changed on a generated register".
            taskDiffApplied: taskDiff !== null,
            tasksInstantiated: tasksInstantiated.map((row) => row.templateCode),
            tasksRetired: tasksRetired.map((row) => row.templateCode),
            ...(taskDiff === null
              ? {}
              : {
                  skippedEventTemplates: [...taskDiff.plan.skippedEventTemplates],
                  unknownOpen: taskDiff.plan.unknownOpen.map((task) => task.id),
                  hasIncome: taskDiff.hasIncome,
                  incomeFactBasis: INCOME_FACT_BASIS,
                }),
            // ⊕ S8 — in the TRAIL as well as in the response. The audit record of a
            // re-classification must say which duties the delta could not speak for, or a reader
            // years later would take "gained: none" as "nothing changed and nothing was unknown".
            incomeFactUndecided,
            bandSettingKeys: [...CLASSIFICATION_BAND_SETTING_KEYS],
            unverified: true,
            note: UNVERIFIED_MARKER,
          },
        });

        return {
          from,
          to: input.to,
          at: at.toISOString(),
          atHijri,
          obligationsGained,
          obligationsLost,
          incomeFactUndecided,
          incomeFactNote: INCOME_FACT_NOTE,
          // ⊕ E7-completion — what the transition DID to the register, not just what it means.
          taskDiff:
            taskDiff === null
              ? ({ applied: false, reason: 'REGISTER_NOT_INSTANTIATED' } as const)
              : {
                  applied: true as const,
                  tasksInstantiated,
                  tasksRetired,
                  skippedEventTemplates: [...taskDiff.plan.skippedEventTemplates],
                  keptOpen: taskDiff.plan.keptOpen.map((task) => ({
                    id: task.id,
                    templateCode: task.templateCode,
                  })),
                  unknownOpen: taskDiff.plan.unknownOpen.map((task) => ({
                    id: task.id,
                    templateCode: task.templateCode,
                  })),
                  hasIncome: taskDiff.hasIncome,
                  incomeFactBasis: INCOME_FACT_BASIS,
                },
        };
      });
    }),

  /**
   * ⊕ S10-2b — THE MIGRATION-34 RETURN DOOR. Returns an endowment to `NOT_CLASSIFIED`.
   *
   * **Two owner rulings, both load-bearing and given two days apart:**
   *  · GATE — 2026-08-25 (S8 addendum, FOURTH batch, ⚠ recorded as OVERRULING the orchestrator):
   *    *"Allow return, reserved-matter-gated."* An erroneous real classification may return *"via a
   *    maker≠checker reserved-matter approval (e.g. a classification entered on the wrong endowment
   *    entirely). The one-way door gains exactly this gated exception; the default refusal stands
   *    for the ungated path."*
   *  · DISPOSITION — 2026-08-27 (S9 addendum, second batch): *"The return-to-NOT_CLASSIFIED act
   *    retires the open tasks with reason 'classification returned to NOT_CLASSIFIED' — rows kept,
   *    history queryable, the reclassification-retirement shape reused. A later correct
   *    classification runs a fresh instantiation."*
   *
   * ⚠ THIS IS NOT `reclassify` WITH A DIFFERENT TARGET, and it is a separate procedure for that
   * reason. `reclassify` is a plain maker act because moving MEDIUM → LARGE is an ordinary
   * determination; this revokes a determination and RE-LOCKS a register whose duties were in force.
   * The zod enum on `reclassify.to` still excludes `NOT_CLASSIFIED` and must keep excluding it —
   * that omission is what stops the gated act being reachable through the ungated door.
   *
   * ⚠ IF THE CLASS IS MERELY WRONG, THIS IS THE WRONG PROCEDURE. Re-classify to the correct class:
   * that keeps the register open, keeps the history, and needs no approval. This exists for the
   * case the ruling names — a determination that should never have been recorded at all.
   */
  returnToNotClassified: makerProcedure('endowment:waqf:write')
    .input(
      z.object({
        approvalRequestId: z.string().min(1).max(128),
        at: z.string().datetime(),
        atHijri: z
          .string()
          .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string'),
        reason: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const at = new Date(input.at);
      const atHijri = assertHijriPairAgrees(at, input.atHijri, 'at', 'atHijri');

      const waqf = await ctx.db.waqf.findFirst({
        where: { id: ctx.waqfId, deletedAt: null },
        select: { classification: true },
      });
      if (waqf === null) {
        // Rung 2 already resolved a grant on this endowment, so a null here means SOFT-DELETED,
        // not absent — `GATE_NOT_CLEARED` rather than the non-disclosure code.
        throw new ApiError(
          'GATE_NOT_CLEARED',
          `waqf ${ctx.waqfId} is soft-deleted; a classification cannot be revoked on a retired ` +
            `endowment record.`,
          { waqfId: ctx.waqfId },
        );
      }
      const from = String(waqf.classification);
      if (from === 'NOT_CLASSIFIED') {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          `waqf ${ctx.waqfId} is already NOT_CLASSIFIED. There is no determination to revoke, and ` +
            `a from = to event is refused by the database as "not a re-classification".`,
          { waqfId: ctx.waqfId },
        );
      }

      /**
       * ⚠ THE KIND IS COMPARED HERE BECAUSE THE DATABASE CANNOT COMPARE IT.
       *
       * `qmulate_reserved_matter_defect` verifies everything expressible as SQL — the approval
       * exists, is RESERVED_MATTER, is APPROVED, belongs to this endowment, has a checker who is
       * not the maker, and names this SUBJECT. `ReservedMatterKind` is a Prisma enum on a column the
       * guard has no reason to know about, so `reservedMatterKind` is this procedure's half, exactly
       * as `finance.receiptClass.executeCorrection` does it. Two halves, neither sufficient: the
       * subject binding stops an approved istibdal unclassifying an endowment, and the kind check
       * stops an approval raised for a different act on the SAME subject string.
       */
      const approval = await ctx.db.approvalRequest.findFirst({
        where: { id: input.approvalRequestId },
        select: { id: true, reservedMatterKind: true, status: true },
      });
      if (approval === null) {
        // NO_GRANT, which the error layer collapses to NOT_FOUND on the wire: "does not exist"
        // and "not yours" must be indistinguishable to a caller (the non-disclosure rule).
        throw new ApiError(
          'NO_GRANT',
          `approval ${input.approvalRequestId} is not visible on this endowment. A reserved matter ` +
            `is per endowment; an approval you cannot see is one you cannot spend.`,
          { waqfId: ctx.waqfId },
        );
      }
      if (String(approval.reservedMatterKind) !== 'CLASSIFICATION_RETURN_TO_NOT_CLASSIFIED') {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          `approval ${input.approvalRequestId} is kind ` +
            `${String(approval.reservedMatterKind)}, not CLASSIFICATION_RETURN_TO_NOT_CLASSIFIED. ` +
            `The kind is COMPARED, never merely recorded: an approval raised for another reserved ` +
            `matter is not a licence to revoke a classification.`,
          { waqfId: ctx.waqfId },
        );
      }

      const subjectId = `waqf:${ctx.waqfId}:classification:NOT_CLASSIFIED`;

      return withReservedMatter(
        ctx.db,
        toActorContext(ctx, { procedure: 'classification.returnToNotClassified' }),
        input.approvalRequestId,
        ctx.waqfId,
        async (tx) => {
          // (a) THE HISTORY FIRST — migration 12's ordering requirement, unchanged by the door:
          //     the BEFORE INSERT trigger re-proves `from` against the LIVE row, so the event must
          //     precede the column write. This is also what makes the revocation a RECORDED ACT
          //     rather than an erasure, which is the argument for why the door is safe at all.
          const event = await tx.reclassificationEvent.create({
            data: {
              waqfId: ctx.waqfId,
              from: from as never,
              to: 'NOT_CLASSIFIED' as never,
              at,
              atHijri,
              reason: input.reason,
              createdBy: ctx.actor.actorId,
            },
            select: { id: true, from: true, to: true, at: true },
          });

          // (b) THEN THE COLUMN. ⚠ No `select` (C-08) — the audit extension diffs against a
          //     full-row pre-image and reads an absent key as null.
          await tx.waqf.update({
            where: { id: ctx.waqfId },
            data: { classification: 'NOT_CLASSIFIED' as never },
          });

          // (c) THE REGISTER. Every OPEN task retires with the RULED reason; nothing instantiates;
          //     terminal rows are untouched. The planner is deliberately NOT the reclassification
          //     diff — at NOT_CLASSIFIED the resolver refuses to partition, so `excluded` is empty
          //     and that diff would retire NOTHING while reporting a plan.
          const existing = (await tx.complianceTask.findMany({
            where: { waqfId: ctx.waqfId },
            select: { id: true, templateCode: true, templateVersion: true, status: true },
            orderBy: { id: 'asc' },
          })) as { id: string; templateCode: string; templateVersion: string; status: string }[];
          const registerPlan = planReturnToNotClassified(existing);
          for (const retirement of registerPlan.retire) {
            await tx.complianceTask.update({
              where: { id: retirement.taskId },
              data: {
                status: 'RETIRED',
                retiredReason: retirement.retiredReason,
                retiredAt: at,
              },
            });
          }

          // (d) SPEND THE APPROVAL. ⚠ LOAD-BEARING, NOT HOUSEKEEPING: `APPROVED` is the only status
          //     `qmulate_reserved_matter_defect` accepts, and
          //     `approval_request_status_transition` refuses every transition OUT of a terminal
          //     state — so moving it to EXECUTED is what makes this approval single-use and stops
          //     the same id opening the door again on a later cycle.
          await tx.approvalRequest.update({
            where: { id: input.approvalRequestId },
            data: { status: 'EXECUTED' },
          });

          await recordEvent(
            toActorContext(ctx, { procedure: 'classification.returnToNotClassified' }),
            {
              action: 'UPDATE',
              category: 'MUTATION',
              classification: 'SENSITIVE',
              entityType: 'ReclassificationEvent',
              entityId: event.id,
              waqfId: ctx.waqfId,
              extraContext: {
                from,
                to: 'NOT_CLASSIFIED',
                atHijri,
                approvalRequestId: input.approvalRequestId,
                reservedMatterKind: 'CLASSIFICATION_RETURN_TO_NOT_CLASSIFIED',
                subjectId,
                tasksRetired: registerPlan.retire.map((row) => row.templateCode),
                tasksUntouched: registerPlan.untouched.map((row) => row.templateCode),
                retiredReason: RETURN_TO_NOT_CLASSIFIED_RETIREMENT_REASON,
                registerRelocked: true,
                unverified: true,
                note: UNVERIFIED_MARKER,
              },
            },
          );

          return {
            from,
            to: 'NOT_CLASSIFIED' as const,
            at: at.toISOString(),
            atHijri,
            approvalRequestId: input.approvalRequestId,
            subjectId,
            tasksRetired: registerPlan.retire.map((row) => ({
              id: row.taskId,
              templateCode: row.templateCode,
              retiredReason: row.retiredReason,
            })),
            tasksUntouched: registerPlan.untouched.map((row) => ({
              id: row.id,
              templateCode: row.templateCode,
              status: row.status,
            })),
            registerRelocked: true as const,
          };
        },
      );
    }),
});
