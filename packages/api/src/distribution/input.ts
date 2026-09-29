/**
 * THE DATABASE → ENGINE MAPPING. `Waqf` + `Beneficiary` + `Transaction` + `Setting` → one
 * `DistributionInputRaw`.
 *
 * The engine is pure, total and synchronous: `runDistribution(raw): DistributionResult`, no options
 * bag, no clock, no I/O. Everything it decides, it decides from this object. So the whole of the
 * distribution feature's correctness that is NOT already inside `packages/domain` is inside this file,
 * and the sprint's standing instruction applies: **the schema comes to the engine, never the reverse.**
 * Nothing here asks the engine to accept a shape the database happens to have.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠ THE CORPUS WALL — CAPITAL RECEIPTS ARE PASSED **IN**, NOT FILTERED OUT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The single most tempting mistake in this file is `where: { receiptClass: 'INCOME' }`. It looks like
 * the corpus guard. It is the opposite of the corpus guard.
 *
 * `schema.prisma` says the run's only legal input is `type = REVENUE AND receiptClass = INCOME`, and
 * that is true of what may be **distributed** — not of what may be **shown to the engine**.
 * `assertIncomeProvenance` (`packages/domain/src/distribution/waterfall.ts`) is the FIRST thing
 * `computeWaterfall` does, and it works by comparing the caller's declared `incomeMinor` against the
 * classified receipts it was given:
 *
 *   receiptClass not exactly INCOME/CAPITAL            ⇒ RECEIPT_UNCLASSIFIED
 *   CAPITAL with capitalSource null                    ⇒ RECEIPT_UNCLASSIFIED
 *   INCOME that NAMES a capitalSource                  ⇒ RECEIPT_UNCLASSIFIED
 *   receipts empty while incomeMinor > 0               ⇒ RECEIPT_UNCLASSIFIED
 *   incomeMinor  >  Σ INCOME                           ⇒ CORPUS_NOT_DISTRIBUTABLE
 *   incomeMinor  <  Σ INCOME                           ⇒ DISTRIBUTION_INPUT_INVALID
 *
 * A caller that drops CAPITAL rows before the call still COMPUTES — and `capitalReceiptsMinor` is
 * `0n`, the `CAPITAL_RECEIPTS_EXCLUDED` flag is never raised, and the `WATERFALL` trace step that
 * names the excluded receipt ids does not exist. **The corpus becomes invisible instead of visibly
 * excluded**, on a run whose whole purpose is to be auditable. The flag keys on the PRESENCE of a
 * capital row, not on a positive amount, so even a 0-halala istibdal row must reach the engine.
 *
 * ⇒ Therefore, in this file: no `receiptClass` filter anywhere; `incomeMinor` is Σ INCOME **exactly**
 *   (a mismatch in either direction is a refusal, in both directions, and that is deliberate); and
 *   every CAPITAL receipt in the period is named in a `CAPITAL_RECEIPTS_PASSED_TO_ENGINE` diagnostic
 *   so the caller's own record shows the wall was fed rather than bypassed.
 *
 * ⚠⚠ AND SINCE 2026-08-20, NO `deletedAt: null` FILTER EITHER — SAME WALL, OTHER SIDE (AV7-F4).
 *   The paragraph above was true of `receiptClass` and, for three weeks, false of the soft-delete
 *   column standing beside it: `ledgerWindowWhere` pinned `deletedAt: null`, so ONE unapproved
 *   `UPDATE "transaction" SET "deletedAt" = now()` on the runtime role took `capitalReceiptsSar`
 *   from 4,200,000.00 to 0.00, dropped `CAPITAL_RECEIPTS_EXCLUDED`, emptied
 *   `excludedCapitalReceipts` and emitted no diagnostic and no trace step — reaching *"the corpus
 *   becomes invisible instead of visibly excluded"* by the exact route this header warns about,
 *   through a filter nobody read as a corpus filter. A retired row is now FETCHED and the run
 *   HALTS on it by name (`LEDGER_ROW_SOFT_DELETED` — see {@link assertRowsInWindow} for the choice
 *   and the argument), and retiring a committed ledger row is itself a reserved matter at the
 *   database (migration 25; product owner, 2026-08-20). **Silence was the one answer available
 *   before, and it is the one answer the ruling forecloses.**
 *
 * ✓ MEASURED against the fixture as it stands: `waqf-001` has TWO revenue rows — `rev-001` (INCOME,
 *   350,000.00) and `rev-005` (CAPITAL, `istibdal_proceeds`, 4,200,000.00). So a `waqf-001` run
 *   carries `revenueMinor = 35,000,000` halalas, `capitalReceiptsMinor = 420,000,000` halalas, and
 *   `CAPITAL_RECEIPTS_EXCLUDED` — and the corpus never touches the distributable.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE REVERSED-PAIR PREDICATE. TWO SOURCE COMMENTS PROMISE IT SOMEWHERE IT IS NOT.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `schema.prisma` (on `Transaction.reversalOfId`) and
 * `migrations/00000000000020_e5_reconciliation_and_receipt_correction/migration.sql` BOTH state that
 * *"`@qmulate/domain/ledger` ships the predicate; E6 owes using it"*.
 *
 * ✓ MEASURED: **it does not exist.** `packages/domain/src/ledger/index.ts` exports
 * `ACCOUNT_CLASSES, CORPUS_ACCOUNT_BY_SOURCE, EXPENSE_ACCOUNT_BY_CATEGORY, EXP_SIYANA_IS_NOT_A_RESERVE,
 * LEDGER_CAPITAL_SOURCES, LEDGER_EXPENSE_CATEGORIES, LEDGER_RECEIPT_CLASSES, OPERATIONAL_ACCOUNTS,
 * UNRULED_RECEIPT_SUBJECTS, accountByCode, accountForTransaction, assertCoversVocabulary,
 * operationalAccountRef` — and nothing matching `/revers/i`. The only implementation in the repo is
 * inline in `finance.reconcile`'s `where` clause.
 *
 * So the predicate is written HERE, once, as {@link excludeReversedPairs}. Two things follow, and
 * neither is silently absorbed:
 *  · **`@qmulate/domain/ledger` is the right home** and this is the wrong one. It is outside this
 *    stage's four files, so the move — plus refactoring `finance.reconcile` onto it — is reported as
 *    owed rather than done badly across an ownership boundary.
 *  · **Those two comments are false as written and this file does not fix them** (both are in files
 *    this stage does not own). They are reported. A comment claiming a control nothing implements is
 *    the defect class this repo has a name for.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THIS IS THE THIRD READING OF THE SHART JSON, AND THAT IS A REPORTED COST
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `shartAlWaqifSchema` (the real zod schema) lives in `packages/database/src/seed/shart.ts` and is
 * NOT exported from that package's barrel; `routers/shart.ts` therefore carries its own structural
 * `projectShart`, which is module-private. Both files say the schema is owed a move into
 * `@qmulate/domain/shart` — a module that does not exist and never has.
 *
 * This file adds a third reader because it cannot import either of the first two. It is deliberately
 * NARROWER (only the fields the engine consumes) and, unlike `routers/shart.ts`'s display projection,
 * it **REFUSES rather than sentinel-defaults**: a shape it does not recognise decides money here,
 * where there it decides a label. When the move lands, {@link readShartForRun} should be replaced by a
 * call to the shared schema, not extended.
 */

import { UNVERIFIED_NOTE, type SettingKey, type SettingValue } from '@qmulate/domain';
import {
  addCalendarDays,
  civilDateFromInstant,
  civilDateFromUtcDate,
  civilDateToUtcDate,
  toHijri,
} from '@qmulate/domain/dates';
import {
  CAPITAL_SOURCES,
  DISBURSEMENT_SCHEDULES,
  minorOf,
  minorToDecimalString,
  type BeneficiaryKind,
  type BeneficiaryLine,
  type DistributionInputRaw,
  type Residency,
  type VerificationStatus,
  type WaqfClassification,
  type WaqfType,
} from '@qmulate/domain/distribution';

import {
  PLAIN_DECIMAL,
  resolveMaintenanceRule,
  sarToMinor,
  type ShartMaintenanceReserve,
} from './maintenance.js';
import { mapperRefusal, mappingDiagnostic, type MappingDiagnostic } from './refusal.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The clock's time zone
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The zone the run's `asOf` DAY is read in.
 *
 * ⚠ THIS IS A DECISION, NOT A DEFAULT, AND IT MOVES A DEADLINE BY A DAY FOR THREE HOURS OUT OF EVERY
 * TWENTY-FOUR. `toHijriSnapshot`'s own docstring says so: *"an instant at 21:30Z is already tomorrow
 * in KSA, so the two answers differ for three hours of every day and both are 'correct' — the caller
 * must choose."* `asOf` feeds `daysUntilDeadline` and therefore `TIMING_STATUS`, i.e. whether a Nazir
 * is reported late.
 *
 * Riyadh is chosen for the same reason `Setting['distribution.deadline.bindingCalendar']` is seeded
 * `EARLIER_OF`: it is the direction in which lateness can never be UNDER-reported (KSA is UTC+03:00
 * with no DST, so the Riyadh day is never behind the UTC day). It is engineering's reading of a
 * question nobody has been asked — *"which calendar day is a Saudi trustee late on?"* — and it is
 * SURFACED in the stage report rather than settled here. Deliberately not a `Setting`: the D2 binding
 * -calendar question is configuration because a lawyer may correct it, and this one is its sibling; if
 * the owner rules on it, it becomes one.
 *
 * ⚠ It is NOT the zone the seed's frozen `…Hijri` history was written in (that is UTC). Nothing here
 * rewrites stored history; this is one live clock read for one computation.
 */
export const RUN_AS_OF_TIME_ZONE = 'Asia/Riyadh' as const;

/** The `Setting` key whose provenance travels into `deadline.settingKey`. */
export const DISTRIBUTION_WINDOW_SETTING_KEY =
  'deadline.DISTRIBUTE_3M_FYE.months' satisfies SettingKey;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The rows this mapping reads — declared STRUCTURALLY
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ NOT Prisma types, on purpose.
 *
 * This module is PURE — no database, no Prisma engine, no generated client — so it is unit-testable
 * with no Postgres on the machine, which is the property that lets the corpus wall and the unit trap
 * be pinned at all. The enum-shaped fields are typed as the ENGINE's unions rather than as strings:
 * Prisma's generated enums are string-literal unions with the same members (verified member-for-member
 * against `schema.prisma`), so a Prisma row assigns cleanly today and a divergence becomes a COMPILE
 * ERROR in the router rather than a `SHART_INCOMPLETE` at request time.
 *
 * The three deed terms that are deliberately NOT narrowed — `entitlementOrder`,
 * `continuationStipulation`, `reversionKind` — are `string`/`string | null` for the engine's own
 * header rule 4: a mis-transcribed FOUNDER'S CONDITION must reach the engine as DATA and halt with the
 * refusal that names it, never die as a shape error carrying `DISTRIBUTION_INPUT_INVALID`.
 */
export interface WaqfRunRow {
  readonly id: string;
  readonly classification: WaqfClassification;
  readonly type: WaqfType;
  /** Free string by design — see the note above. */
  readonly entitlementOrder: string;
  /** Free string by design. `null` = the deed continues no particular line. */
  readonly continuationStipulation: string | null;
  /** `"MM-DD"`. */
  readonly fiscalYearEnd: string;
  /** ⚠ `false` ⇒ nobody has read the deed's مآل clause ⇒ this mapping REFUSES. */
  readonly reversionClauseCaptured: boolean;
  /** Free string by design. `null` + captured ⇒ the deed positively records no ultimate taker. */
  readonly reversionKind: string | null;
  /** The `shartAlWaqif` Json column, unparsed. Read by {@link readShartForRun}. */
  readonly shartAlWaqif: unknown;
}

/** One `Beneficiary` row. `null`s are recorded facts; none of them is defaulted here. */
export interface BeneficiaryRunRow {
  readonly id: string;
  readonly kind: BeneficiaryKind;
  /** Vital / in-scope status. Read by the engine ALONG AN ANCESTOR WALK, not only per row. */
  readonly active: boolean;
  /** A CROSS-CHECK, not a trusted input: derived `parentId` depth wins at the engine. */
  readonly tabaqa: number | null;
  /** `null` = a child of the waqif (derived ṭabaqa 1). NEVER "unknown". */
  readonly parentId: string | null;
  /** `'SON' | 'DAUGHTER'`; `null` = not a descendant. An ELIGIBILITY FACT, never rendered as gender. */
  readonly lineageLink: string | null;
  readonly line: BeneficiaryLine;
  /** Required and non-null in the schema; the engine's field is nullable. */
  readonly branch: string | null;
  /** `Decimal(38,18)`. ⚠ NULL is REFUSED, never substituted — see `BENEFICIARY_WEIGHT_MISSING`. */
  readonly stipulatedWeight: string | { toString(): string } | null;
  readonly verificationStatus: VerificationStatus;
  /** A UTC-midnight `DateTime` column. `null` ⇒ `KYC_UNVERIFIED`, never `STALE_KYC`. */
  readonly kycLastRefreshed: Date | null;
  /** `Beneficiary.categoryDescriptionAr` — the engine calls it `category`. */
  readonly categoryDescriptionAr: string | null;
  readonly residency: Residency;
}

/**
 * One `Transaction` row, as fetched by {@link ledgerWindowWhere}.
 *
 * ⚠ THE CALLER MUST HAND OVER **EVERY** ROW IN THE WINDOW, INCLUDING REVERSALS. The reversed-pair
 * exclusion asks "has this row been reversed?", and that question is only answerable if the reversal
 * row is in the set. A caller that pre-filtered `reversalOfId: null` has already destroyed the
 * information needed to drop the reversed ORIGINAL, and would then count corrected money twice.
 */
export interface LedgerRunRow {
  readonly id: string;
  readonly type: 'REVENUE' | 'EXPENSE';
  /** ⚠ Passed through VERBATIM, including `null`. Never coerced to INCOME. */
  readonly receiptClass: string | null;
  readonly capitalSource: string | null;
  readonly expenseCategory: string | null;
  /** `Decimal(18,2)` — a decimal string or a `Decimal`. Never a JS number. */
  readonly amountSar: string | { toString(): string };
  readonly date: Date;
  readonly reversalOfId: string | null;
  readonly deletedAt: Date | null;
}

/**
 * Every `Setting` the run needs, ALREADY RESOLVED, as whole envelopes.
 *
 * Envelopes and not bare values: binding rule 3 leaks through a convenient API, and `unverified` plus
 * the ⚠ note have to travel with each figure into whatever renders it. `SettingResolver.getMany` in
 * `../settings.ts` produces exactly this shape, one query, endowment → global, failing on the FIRST
 * missing key rather than returning a partial map.
 *
 * The two nullable members are nullable because **absence is a real state, not a resolver failure**:
 * neither key has a global row, so "the Nazir has recorded no ṣiyāna discretion for this endowment"
 * and "no fee figure is configured" must be representable. The caller catches `SETTING_MISSING` for
 * those two and passes `null`; for every other key a miss is fatal and must stay fatal.
 */
export interface DistributionRunSettings {
  readonly kycRefreshMonths: SettingValue<'kyc.refreshIntervalMonths'>;
  readonly roundingUnitMinor: SettingValue<'distribution.rounding.unitMinor'>;
  readonly roundingMethod: SettingValue<'distribution.rounding.method'>;
  readonly bindingCalendar: SettingValue<'distribution.deadline.bindingCalendar'>;
  readonly distributionWindowMonths: SettingValue<'deadline.DISTRIBUTE_3M_FYE.months'>;
  /** `null` ⇒ no row at any tier. See {@link ShartMaintenanceReserve} and `./maintenance.ts`. */
  readonly maintenanceNazirDiscretionPercent: SettingValue<'distribution.maintenance.nazirDiscretionPercent'> | null;
  /** `null` ⇒ no row at any tier. ⚠ NEVER substituted for a silent deed — the fee is deed-set. */
  readonly nazirFeePercentOfRevenue: SettingValue<'nazirFee.percentOfRevenue'> | null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The period window, and the reversed-pair predicate
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** A half-open instant window: `[fromInclusive, toExclusive)`. */
export interface PeriodWindow {
  readonly fromInclusive: Date;
  readonly toExclusive: Date;
}

/**
 * The instant window for a civil period.
 *
 * ⚠ HALF-OPEN, AND THAT IS A CORRECTION TO THE OBVIOUS `lte`. `Transaction.date` is a bare `DateTime`
 * with no `@db.Date`, so a row *may* carry a time of day even though the seed anchors every fixture
 * date at UTC midnight (`parseFixtureDate`: *"a bare `YYYY-MM-DD` anchored at UTC midnight"*). A
 * `date <= civilDateToUtcDate(period.end)` bound therefore silently DROPS every receipt captured with
 * a clock time on the period's last day — the last day of a fiscal year being exactly when a Nazir
 * captures receipts. `< midnight of (end + 1 day)` includes the whole final day whatever time it
 * carries.
 *
 * ⚠ The bounds are read in **UTC**, matching every `DateTime` the seed writes. That is a different
 * choice from {@link RUN_AS_OF_TIME_ZONE}, and deliberately so: `asOf` is a live instant being
 * resolved to a day, while these bounds are being compared against stored UTC-anchored values. Both
 * are recorded rather than assumed; whether a fiscal period bounds instants in Riyadh time is part of
 * the same unasked question.
 */
export function periodWindow(periodStartIso: string, periodEndIso: string): PeriodWindow {
  return {
    fromInclusive: civilDateToUtcDate(periodStartIso),
    toExclusive: civilDateToUtcDate(addCalendarDays(periodEndIso, 1)),
  };
}

/**
 * The Prisma `where` for a period's ledger — **with no `type`, no `receiptClass` and no `deletedAt`
 * filter.**
 *
 * The absent filters are the point, and they are absent for three different reasons:
 *  · **no `receiptClass` filter** — the corpus wall (see the file header). CAPITAL rows must reach the
 *    engine so it can raise `CAPITAL_RECEIPTS_EXCLUDED` and trace the ids it excluded;
 *  · **no `reversalOfId`/`reversedBy` filter** — the pair exclusion needs to SEE the reversal rows to
 *    know the originals were reversed (see {@link excludeReversedPairs}). Pushing it into SQL as
 *    `reversalOfId: null, reversedBy: { none: {} }` is correct in isolation and destroys the
 *    information the in-memory cross-check needs, which is why it is not done here;
 *  · **no `deletedAt: null` filter — THE THIRD ABSENT FILTER, AND IT IS ABSENT FOR THE FIRST ONE'S
 *    REASON EXACTLY** (AV7-F4, closed 2026-08-20). This predicate DID pin `deletedAt: null`, and the
 *    consequence was measured on `qmulate_app` with no approval anywhere:
 *
 *        UPDATE "transaction" SET "deletedAt" = now() WHERE "id" = <a CAPITAL receipt>  → 1 row
 *        BEFORE  revenue 500000.00 · capitalReceipts 4200000.00  [CAPITAL_RECEIPTS_EXCLUDED raised]
 *        AFTER   revenue 500000.00 · capitalReceipts       0.00  [flag ABSENT, excluded list EMPTY,
 *                                                                no diagnostic, no trace step]
 *
 *    The corpus became INVISIBLE instead of VISIBLY EXCLUDED — the identical failure the missing
 *    `receiptClass` filter exists to prevent, arrived at from the other side. And it made
 *    {@link assertRowsInWindow}'s `LEDGER_ROW_SOFT_DELETED` refusal — which was already written and
 *    already correct — **unreachable**, because SQL never handed it such a row. So the filter is
 *    gone and the refusal is the decision point.
 *
 * ⚠ EVERY OTHER READ IN THIS SYSTEM STILL FILTERS `deletedAt: null`, AND SHOULD. This is not a
 * general position on soft deletion; it is the one query whose job is to say what the register
 * contained. A screen listing receipts hides retired ones; a run that PAYS may not.
 *
 * `orderBy: { id: 'asc' }` is not cosmetic: the receipt array's order is inside the canonical bytes a
 * Nazir signs, and `WaqfReversionTaker` has no ordering column either. A run must be reproducible.
 */
export function ledgerWindowWhere(args: {
  readonly waqfId: string;
  readonly window: PeriodWindow;
}): {
  readonly waqfId: string;
  readonly date: { readonly gte: Date; readonly lt: Date };
} {
  return {
    waqfId: args.waqfId,
    date: { gte: args.window.fromInclusive, lt: args.window.toExclusive },
  };
}

/** What {@link excludeReversedPairs} kept, and what it dropped. */
export interface ReversedPairExclusion {
  readonly kept: readonly LedgerRunRow[];
  /** Ids dropped, sorted — both the reversals and the originals they reversed. */
  readonly excludedIds: readonly string[];
}

/**
 * Drop every reversed original AND its mirroring reversal.
 *
 * ⚠ THE PAIR NETS TO ZERO BY **EXCLUSION**, NOT BY ARITHMETIC. `transaction_amount_nonnegative` holds
 * and the sign is carried by `type`, so a negative contra-entry is structurally unrepresentable: a
 * consumer that included both rows would report the corrected receipt AND the two rows that cancel
 * each other — i.e. the money twice. The owner ruled this shape in Q-E5-1(b) and `finance.reconcile`
 * already implements it inline; nothing in Postgres forces a consumer to do it.
 *
 * `transaction_correction_shape()` guarantees a reversal MIRRORS its original exactly (same `type`,
 * `receiptClass`, `capitalSource`, `amountSar`, `bankAccountId`) and forbids chains (a reversal cannot
 * itself be reversed), so one pass is enough — there is no transitive closure to walk.
 *
 * ⚠ THE HOME IS WRONG AND IT IS REPORTED, NOT HIDDEN: `@qmulate/domain/ledger` is where two source
 * comments already promise this predicate lives, and it does not. See the file header.
 */
export function excludeReversedPairs(rows: readonly LedgerRunRow[]): ReversedPairExclusion {
  const reversedOriginalIds = new Set<string>();
  for (const row of rows) {
    if (row.reversalOfId !== null) reversedOriginalIds.add(row.reversalOfId);
  }

  const kept: LedgerRunRow[] = [];
  const excludedIds: string[] = [];
  for (const row of rows) {
    if (row.reversalOfId !== null || reversedOriginalIds.has(row.id)) {
      excludedIds.push(row.id);
      continue;
    }
    kept.push(row);
  }
  return { kept, excludedIds: [...excludedIds].sort() };
}

/**
 * Refuse a row that must not be evidence for a run — a row outside the period, or a retired one.
 *
 * ── THE **WINDOW** HALF IS CHECKED TWICE, AND SAYING SO IS STILL TRUE ────────────────────────
 * The period bounds are applied once by `ledgerWindowWhere`'s SQL and once here, because a router
 * that fetched the wrong period would otherwise produce a plausible wrong payout with nothing to
 * catch it. Two sides that must agree, each testing the other, is this repo's standing lesson; a
 * single trusted side is how the untiered-`FAMILY` member that took the whole pool shipped.
 *
 * ── ⚠ THE **SOFT-DELETE** HALF IS NOT, AND THE OLD VERSION OF THIS COMMENT CLAIMED IT WAS ────
 * It read *"the window and the soft-delete filter are applied TWICE"*. That was **false in the
 * direction that mattered**: `ledgerWindowWhere` pinned `deletedAt: null` in SQL, so this branch
 * could never fire — a second check over a set the first check has already emptied is not a second
 * check. AV7-F4 measured the consequence (see {@link ledgerWindowWhere}): a soft-deleted CAPITAL
 * receipt did not get refused here, it silently **left the run**, taking `capitalReceiptsSar` from
 * 4,200,000.00 to 0.00 with no flag, no diagnostic and no trace step. The SQL filter is gone; this
 * is now the ONLY check, and it is reachable. The comment is corrected rather than deleted because
 * the sentence itself was load-bearing evidence.
 *
 * ── ⚠ REFUSE BY NAME, NOT NAME-AND-KEEP-COMPUTING — THE CHOICE, AND WHY ─────────────────────
 * The fix had a real decision in it and this is the branch taken, with the argument stated so it can
 * be overturned deliberately rather than by drift:
 *
 *  1. **A CORRECTION IS NEVER A RETIREMENT IN THIS SYSTEM.** The owner-ruled instrument for a wrong
 *     receipt is a SUPERSEDING RECORD — a mirroring reversal plus a re-entered row (Q-E5-1(b)) —
 *     and {@link excludeReversedPairs} already handles that shape, keeping both rows VISIBLE and
 *     netting them to zero by exclusion. So a retired row inside a period is not the ordinary
 *     correction path even after migration 25 makes it an APPROVED act: it is an anomalous state,
 *     and the run cannot say what the register means while one is in it.
 *  2. **THE ALTERNATIVE PICKS A NUMBER.** "Name it and keep computing" has to decide whether the
 *     row's money counts. Counting it pays out of a receipt an approval removed; not counting it
 *     silently shrinks the pool with a diagnostic beside it — and a diagnostic is not a refusal,
 *     it is a line a screen may not render. Either way this file would be choosing, which is the
 *     one thing the mapper exists not to do.
 *  3. **THE SENTENCE ALREADY EXISTS IN BOTH LOCALES.** `LEDGER_ROW_SOFT_DELETED` maps to
 *     `DISTRIBUTION_INPUT_INVALID`, which has ar/en copy today. A new `MAPPING_DIAGNOSTICS` code
 *     would have none — that whole channel is TIER-2 copy nothing in CI notices is missing.
 *
 * ⚠ AND IT IS A HALT, NOT A WEDGE. `preview` returns the refusal as DATA (`{ status: 'refused',
 * refusal: 'LEDGER_ROW_SOFT_DELETED' }`), naming the row, its class, its capital source and its
 * amount — so the Nazir is told which receipt and how much, and the remedy (clear `deletedAt`
 * through the same reserved-matter gate, or re-record the correction as a reversal pair) is
 * reachable. Compare AV7-H, where a refusal's advertised remedy had no procedure at all.
 *
 * ⚠ THE INCOME/CAPITAL DIFFERENCE IS IN THE SENTENCE, NEVER IN THE STRICTNESS — the same rule the
 * database gate follows, by the same ruling (owner, 2026-08-20, memo "S7 · AV7-F4", option (a)).
 * There is exactly ONE `throw` below for both classes.
 */
function assertRowsInWindow(rows: readonly LedgerRunRow[], window: PeriodWindow): void {
  for (const row of rows) {
    if (row.deletedAt !== null) {
      // The corpus/income difference is a SENTENCE, not a second code path.
      const side =
        row.type === 'REVENUE' && row.receiptClass === 'CAPITAL'
          ? `a CAPITAL receipt (asl / أصل, capitalSource=${row.capitalSource ?? 'NULL'}) — corpus ` +
            `this run would otherwise not be able to see`
          : row.type === 'REVENUE'
            ? `an INCOME receipt (ghallah / غلة) — ghallah this run would otherwise pay a smaller ` +
              `pool out of, and report the smaller figure as the whole`
            : `an EXPENSE (${row.expenseCategory ?? 'NULL'}) — a real bank movement the waterfall ` +
              `and the reconciliation would both stop seeing`;
      throw mapperRefusal(
        'LEDGER_ROW_SOFT_DELETED',
        `transaction ${row.id} is soft-deleted (deletedAt=${row.deletedAt.toISOString()}) and must ` +
          `not be evidence for a distribution run. It is ${side}, for SAR ` +
          `${row.amountSar.toString()} dated ${row.date.toISOString()}. The run HALTS rather than ` +
          `dropping it: a retired row is not the correction path in this system (a correction is a ` +
          `superseding reversal pair, which stays visible), and silently excluding it would make ` +
          `this mapping decide whether the money counts. Retiring a committed ledger row is itself ` +
          `a reserved matter (migration 25; product owner, 2026-08-20), so this state carries an ` +
          `approval — and an approval buys the retirement, not the run's silence about it.`,
        {
          transactionId: row.id,
          transactionType: row.type,
          receiptClass: row.receiptClass ?? 'NULL',
          capitalSource: row.capitalSource ?? 'NULL',
          amountSar: row.amountSar.toString(),
          rowDate: row.date.toISOString(),
          deletedAt: row.deletedAt.toISOString(),
        },
      );
    }
    const instant = row.date.getTime();
    if (
      Number.isNaN(instant) ||
      instant < window.fromInclusive.getTime() ||
      instant >= window.toExclusive.getTime()
    ) {
      throw mapperRefusal(
        'LEDGER_ROW_OUTSIDE_PERIOD_WINDOW',
        `transaction ${row.id} is dated ${row.date.toISOString()}, outside the window ` +
          `[${window.fromInclusive.toISOString()}, ${window.toExclusive.toISOString()}). The window is ` +
          `checked here as well as in the query: a run assembled from the wrong period pays a ` +
          `plausible wrong number, and nothing downstream can tell.`,
        { transactionId: row.id, rowDate: row.date.toISOString() },
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · Reading the Shart Json — narrow, total, and REFUSING
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Only the clauses the engine consumes. See the file header on why this is a third reader. */
export interface ShartRunProjection {
  readonly orderRule: string | null;
  readonly continuationStipulation: string | null;
  readonly reversion: {
    readonly status: string;
    readonly kind: string | null;
    readonly ultimateTakerIds: readonly string[];
  };
  readonly maintenanceReserve: ShartMaintenanceReserve;
  readonly nazirFee: {
    readonly basis: string | null;
    /** ⚠ ALREADY out of 100 in this Json, unlike `maintenanceReserve.rate`. Unverified (ʿushr). */
    readonly ratePercent: number | null;
    readonly amountSar: string | null;
  };
  readonly disbursementSchedule: string | null;
  readonly completeness: {
    /** HALTING by the Shart's own declaration. */
    readonly missing: readonly string[];
    /** NON-halting. Kept in a separate channel; never merged with `missing`. */
    readonly advisory: readonly string[];
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * Read the Shart Json, refusing every shape this build does not recognise.
 *
 * Contrast with `routers/shart.ts`'s `projectShart`, which coerces an unknown shape to
 * `'unrecognised'`: that projection feeds a LABEL and a sentinel is the honest answer there. This one
 * feeds a ṣiyāna reserve, a Nazir fee and an entitlement order, so a missing sub-object is a refusal.
 */
export function readShartForRun(raw: unknown): ShartRunProjection {
  const shart = asRecord(raw);
  if (shart === null) {
    throw mapperRefusal(
      'SHART_UNREADABLE',
      "the shartAlWaqif column is not a Json object. The founder's conditions are what the engine " +
        'computes from; an unreadable Shart is not an empty one.',
    );
  }
  const reversion = asRecord(shart['reversion']);
  const maintenance = asRecord(shart['maintenanceReserve']);
  const fee = asRecord(shart['nazirFee']);
  const completeness = asRecord(shart['completeness']);
  if (reversion === null || maintenance === null || fee === null || completeness === null) {
    throw mapperRefusal(
      'SHART_UNREADABLE',
      'the shartAlWaqif Json is missing one of the four clauses a run reads as an object ' +
        '(reversion, maintenanceReserve, nazirFee, completeness). Refused rather than treated as ' +
        'absent: "the deed does not say" and "we cannot read what the deed says" have different remedies.',
      {
        hasReversion: String(reversion !== null),
        hasMaintenanceReserve: String(maintenance !== null),
        hasNazirFee: String(fee !== null),
        hasCompleteness: String(completeness !== null),
      },
    );
  }

  return {
    orderRule: asNonEmptyString(shart['orderRule']),
    continuationStipulation: asNonEmptyString(shart['continuationStipulation']),
    reversion: {
      // ⚠ THREE STATES, AND `unread` IS NEVER REPORTED AS `none`.
      status: asNonEmptyString(reversion['status']) ?? '',
      kind: asNonEmptyString(reversion['kind']),
      ultimateTakerIds: asStringArray(reversion['ultimateTakerIds']),
    },
    maintenanceReserve: {
      kind: asNonEmptyString(maintenance['kind']) ?? '',
      amountSar: asNonEmptyString(maintenance['amountSar']),
      rate: asFiniteNumber(maintenance['rate']),
      targetBalanceSar: asNonEmptyString(maintenance['targetBalanceSar']),
    },
    nazirFee: {
      basis: asNonEmptyString(fee['basis']),
      ratePercent: asFiniteNumber(fee['ratePercent']),
      amountSar: asNonEmptyString(fee['amountSar']),
    },
    disbursementSchedule: asNonEmptyString(shart['disbursementSchedule']),
    completeness: {
      missing: asStringArray(completeness['missing']),
      advisory: asStringArray(completeness['advisory']),
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · The Nazir fee — deed-set (Nazarah Art. 11), never statutory, never configured
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The engine's `nazirFee` field plus what the mapping observed. `null` rule ⇒ the deed is silent. */
interface NazirFeeResolution {
  readonly rule: DistributionInputRaw['nazirFee'];
  readonly diagnostics: readonly MappingDiagnostic[];
}

/**
 * Resolve the Nazir fee from the DEED, and from nowhere else.
 *
 * ⚠ A SILENT DEED DOES NOT FALL BACK TO A `Setting`. The fee is set by the waqf deed (Nazarah Art. 11
 * — this engagement's is the customary ʿushr, 10% of revenue ⚠ verify, may be stale, confirm vs
 * primary law). It is NOT the Awqaf Law Art. 14 ≤10%-of-NET-INCOME Authority fee, and it is not a
 * platform figure. So `basis: 'UNSPECIFIED'` maps to `null`, the engine deducts nothing and raises
 * `AUTHORITY_FEE_DETERMINATION_PENDING` — which is the honest state — and a configured figure sitting
 * beside a silent deed is REPORTED, not applied. Whether a configured figure may stand in for a silent
 * deed is a trusteeship-authority question; it is surfaced, not answered.
 *
 * ✓ MEASURED: `waqf-002` and `waqf-004` are exactly the silent case (`basis: 'UNSPECIFIED'`), and
 * `waqf-001` is the case where deed and configured figure AGREE (deed 10%, `Setting` override `10`) —
 * so the disagreement branch has to be asserted rather than assumed unreachable.
 */
function resolveNazirFee(args: {
  readonly waqfId: string;
  readonly deed: ShartRunProjection['nazirFee'];
  readonly configuredPercentOfRevenue: number | null;
}): NazirFeeResolution {
  const { waqfId, deed, configuredPercentOfRevenue } = args;
  const diagnostics: MappingDiagnostic[] = [];

  const basis = deed.basis;
  if (basis === null || basis === 'UNSPECIFIED') {
    if (configuredPercentOfRevenue !== null) {
      diagnostics.push(
        mappingDiagnostic('NAZIR_FEE_DEED_SILENT_CONFIGURED_FIGURE_NOT_SUBSTITUTED', 'CONFLICT', {
          waqfId,
          configuredPercentOfRevenue: String(configuredPercentOfRevenue),
          applied: 'NONE',
          engineFlagExpected: 'AUTHORITY_FEE_DETERMINATION_PENDING',
        }),
      );
    }
    return { rule: null, diagnostics };
  }

  if (basis === 'PERCENT_OF_REVENUE' || basis === 'PERCENT_OF_NET_INCOME') {
    if (deed.ratePercent === null) {
      throw mapperRefusal(
        'NAZIR_FEE_RULE_INCOMPLETE',
        `the deed sets a Nazir fee basis of ${basis} but records no rate. A basis without its figure ` +
          `is not a fee rule, and substituting one would be this code setting the trustee's remuneration.`,
        { waqfId, feeBasis: basis },
      );
    }
    // ⚠ ALREADY out of 100 here — the Shart's `nazirFee.ratePercent` is a 0–100 number, unlike
    // `maintenanceReserve.rate` which is a 0–1 rate. Two clauses in one Json, two scales.
    const ratePercent = numberAsRatePercent(deed.ratePercent, `${waqfId}.nazirFee.ratePercent`);
    if (
      configuredPercentOfRevenue !== null &&
      basis === 'PERCENT_OF_REVENUE' &&
      numberAsRatePercent(configuredPercentOfRevenue, 'nazirFee.percentOfRevenue') !== ratePercent
    ) {
      diagnostics.push(
        mappingDiagnostic('NAZIR_FEE_DEED_RATE_DISAGREES_WITH_CONFIGURED_FIGURE', 'CONFLICT', {
          waqfId,
          deedRatePercent: ratePercent,
          configuredPercentOfRevenue: String(configuredPercentOfRevenue),
          applied: 'DEED',
        }),
      );
    }
    return { rule: { basis, ratePercent }, diagnostics };
  }

  if (basis === 'RETAINER') {
    if (deed.amountSar === null) {
      throw mapperRefusal(
        'NAZIR_FEE_RULE_INCOMPLETE',
        'the deed sets a RETAINER Nazir fee and records no amount.',
        { waqfId, feeBasis: basis },
      );
    }
    return {
      rule: { basis, fixedAmountMinor: sarToMinor(deed.amountSar, `${waqfId}.nazirFee.amountSar`) },
      diagnostics,
    };
  }

  throw mapperRefusal(
    'NAZIR_FEE_BASIS_UNRECOGNISED',
    `the deed records a Nazir fee basis of "${basis}", which this build does not recognise. Refused ` +
      `rather than mapped onto the nearest basis: PERCENT_OF_REVENUE and PERCENT_OF_NET_INCOME pay ` +
      `different amounts out of the same period.`,
    { waqfId, feeBasis: basis },
  );
}

/** A JSON number that is already a percentage out of 100, as the engine's decimal string. */
function numberAsRatePercent(value: number, context: string): string {
  const text = String(value);
  if (!PLAIN_DECIMAL.test(text) || value < 0 || value > 100) {
    throw mapperRefusal(
      'RATE_UNREPRESENTABLE',
      `${context} prints as "${text}", which is not a plain decimal percentage in [0, 100].`,
      { context, received: text },
    );
  }
  return text;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · The builder
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface BuildDistributionInputArgs {
  readonly waqf: WaqfRunRow;
  readonly beneficiaries: readonly BeneficiaryRunRow[];
  /**
   * `waqf_reversion_taker.beneficiaryId` for this endowment — the ids the DEED clause names.
   *
   * ⚠ NEVER DEDUPLICATED here. The join table's `@@unique([waqfId, beneficiaryId])` means a repeat
   * cannot come from the database, but the Shart Json's own list can carry one and a repeat MOVES
   * MONEY (it would double-count in the weight vector). The engine refuses it by name
   * (`REVERSION_ULTIMATE_TAKER_DUPLICATED`); this mapping's job is to let it get there.
   */
  readonly ultimateTakerIds: readonly string[];
  /** EVERY row in the window, unfiltered — see {@link LedgerRunRow}. */
  readonly ledger: readonly LedgerRunRow[];
  readonly settings: DistributionRunSettings;
  /** Civil dates, `yyyy-MM-dd`. Caller/UI input: the database has no source for a run's period. */
  readonly period: { readonly start: string; readonly end: string };
  /**
   * The post-FYE deadline as TWO INDEPENDENT DAYS — `FYE + N calendar months` in Gregorian, and
   * `Hijri(FYE) + N Hijri months` in Umm al-Qura. They are DIFFERENT DAYS on purpose and the engine
   * deliberately does not cross-check them (unlike `asOf`, which it does).
   *
   * Passed in rather than computed here because the Gregorian half needs the KSA business-day
   * calendar (a workweek `Setting` plus holiday rules), which is not a pure function of these inputs.
   */
  readonly deadline: { readonly gregorian: string; readonly hijri: string };
  /** The request's single clock read (`ctx.now`). Resolved to a day in {@link RUN_AS_OF_TIME_ZONE}. */
  readonly now: Date;
  /** The ṣiyāna fund's balance in halalas, for a `target_topup` deed. `null` today, always. */
  readonly reserveFundBalanceMinor?: bigint | null;
}

/**
 * The run's input, plus every observation the mapping made getting there.
 *
 * ⚠ NOT A BARE `DistributionInputRaw`, and the reason is Q-S7-1. The mapping is the only place that
 * sees both the deed's ṣiyāna rule and the Nazir's recorded discretion; if the return type had no room
 * for that conflict it would have to be dropped, and dropping it is what left `waqf-001` carrying two
 * contradictory reserve policies with nothing anywhere pointing at it. `.input` is the engine's
 * argument; `.diagnostics` is what a human has to see.
 */
export interface DistributionMapping {
  readonly input: DistributionInputRaw;
  readonly diagnostics: readonly MappingDiagnostic[];
}

/**
 * Assemble one `DistributionInputRaw` from the record.
 *
 * ── ORDER OF REFUSALS, AND WHY IT IS THIS ORDER ───────────────────────────────────────────────
 *  0. the Shart Json is readable at all;
 *  1. the deed's order rule and continuation term AGREE between column and Json — two recorded copies
 *     of a founder's condition with money between them, and neither is the drifted side a priori;
 *  2. the مآل clause: a DISAGREEMENT between the columns and the Json first (strictly more alarming
 *     than either state on its own), then the un-read state;
 *  3. `completeness.missing` — halting by the Shart's own declaration, and INVISIBLE to the engine;
 *  4. everything the engine can refuse for itself is PASSED THROUGH, not pre-empted. An unrecognised
 *     `entitlementOrder`, a missing lineage edge, a joint waqf, a charity beside a living descendant:
 *     all of those are the engine's twenty-six discriminators to raise, and re-implementing any of
 *     them here would create a second, drifting judge of the founder's conditions.
 *
 * @throws `DomainError` — always with a `details.mapperRefusal` from `MAPPER_REFUSALS`, or a `MONEY_*`
 *   code from `@qmulate/domain`. Read it with `resolveRefusal`, never by its `code` alone.
 */
export function buildDistributionInput(args: BuildDistributionInputArgs): DistributionMapping {
  const {
    waqf,
    beneficiaries,
    ultimateTakerIds,
    ledger,
    settings,
    period,
    deadline,
    now,
    reserveFundBalanceMinor = null,
  } = args;
  const diagnostics: MappingDiagnostic[] = [];
  const shart = readShartForRun(waqf.shartAlWaqif);

  /* ── 1 · the two deed terms recorded twice ────────────────────────────────────────────────── */
  if (shart.orderRule !== waqf.entitlementOrder) {
    throw mapperRefusal(
      'ENTITLEMENT_ORDER_DISAGREES_WITH_SHART',
      `Waqf.entitlementOrder is "${waqf.entitlementOrder}" and shartAlWaqif.orderRule is ` +
        `"${String(shart.orderRule)}". Two recorded copies of the founder's order rule disagree, and ` +
        `they decide who is entitled at all. Refused rather than resolved by preferring one side.`,
      {
        waqfId: waqf.id,
        column: waqf.entitlementOrder,
        shart: String(shart.orderRule),
      },
    );
  }
  if (shart.continuationStipulation !== waqf.continuationStipulation) {
    throw mapperRefusal(
      'CONTINUATION_STIPULATION_DISAGREES_WITH_SHART',
      `Waqf.continuationStipulation is ${JSON.stringify(waqf.continuationStipulation)} and ` +
        `shartAlWaqif.continuationStipulation is ${JSON.stringify(shart.continuationStipulation)}. ` +
        `Which lines the deed continues decides the HEAD COUNT — under the engine's own worked example ` +
        `the same pool pays 6 heads or 8 from this one field.`,
      {
        waqfId: waqf.id,
        column: String(waqf.continuationStipulation),
        shart: String(shart.continuationStipulation),
      },
    );
  }

  /* ── 2 · مآل الوقف ───────────────────────────────────────────────────────────────────────── */
  const reversion = resolveReversion(waqf, shart, ultimateTakerIds);

  /* ── 3 · the Shart's own halting gaps, which the engine cannot see ─────────────────────────── */
  if (shart.completeness.missing.length > 0) {
    throw mapperRefusal(
      'SHART_COMPLETENESS_HALTING_GAP',
      `the Shart declares ${String(shart.completeness.missing.length)} HALTING gap(s): ` +
        `${shart.completeness.missing.join(', ')}. These are not engine input — nothing in ` +
        `DistributionInputRaw carries them — so the seed's claim that a halting gap makes the engine ` +
        `refuse is only true if this boundary enforces it.`,
      { waqfId: waqf.id, missing: [...shart.completeness.missing] },
    );
  }
  if (shart.completeness.advisory.length > 0) {
    diagnostics.push(
      mappingDiagnostic('SHART_ADVISORY_GAP', 'NOTICE', {
        waqfId: waqf.id,
        advisory: shart.completeness.advisory.join(','),
      }),
    );
  }

  /* ── 4 · the ledger: window, reversed pairs, then the corpus wall ──────────────────────────── */
  const window = periodWindow(period.start, period.end);
  assertRowsInWindow(ledger, window);
  const { kept, excludedIds } = excludeReversedPairs(ledger);
  if (excludedIds.length > 0) {
    diagnostics.push(
      mappingDiagnostic('LEDGER_REVERSED_PAIR_EXCLUDED', 'NOTICE', {
        waqfId: waqf.id,
        excludedTransactionIds: excludedIds.join(','),
        rule: 'a reversed original AND its reversal are both dropped; the pair nets to zero by exclusion',
      }),
    );
  }

  const receipts: DistributionInputRaw['revenue']['receipts'] = [];
  const capitalReceiptIds: string[] = [];
  let incomeMinor = 0n;
  for (const row of [...kept].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (row.type !== 'REVENUE') continue;
    if (row.receiptClass === null) {
      // The DB CHECK makes this unrepresentable on a REVENUE row; if it happens anyway, the engine's
      // own code is the right one and its sentence already exists in both locales.
      throw mapperRefusal(
        'RECEIPT_CLASS_MISSING',
        `revenue row ${row.id} carries no receiptClass. Every receipt is classified income-vs-capital ` +
          `AT ENTRY; an unclassified receipt is refused, never assumed to be income.`,
        { transactionId: row.id },
      );
    }
    const amountMinor = sarToMinor(asMoneyInput(row.amountSar), `${row.id}.amountSar`);
    // ⚠ receiptClass and capitalSource go through VERBATIM. Coercing either is how the wall falls.
    receipts.push({
      id: row.id,
      receiptClass: row.receiptClass,
      amountMinor,
      capitalSource: asCapitalSource(row.capitalSource),
    });
    if (row.receiptClass === 'INCOME') {
      incomeMinor += amountMinor;
    } else if (row.receiptClass === 'CAPITAL') {
      capitalReceiptIds.push(row.id);
    }
    // ⚠ NEITHER BRANCH FOR ANY OTHER STRING, AND THAT IS A FIX, NOT AN OVERSIGHT. This was
    // `else { capitalReceiptIds.push(...) }`, which reported EVERY non-`INCOME` class as a corpus
    // receipt. MEASURED before the change (`distribution-input.test.ts`, the "hands an UNRECOGNISED
    // receiptClass to the engine verbatim" case): a row carrying the lower-case `'income'` — a class
    // the DB CHECK cannot produce but a bypassed constraint or a future enum member could — came back
    // in a `CAPITAL_RECEIPTS_PASSED_TO_ENGINE` diagnostic naming it as capital. "We cannot classify
    // this receipt" and "this receipt is corpus" are different facts with different remedies, and the
    // second is a claim about the founder's principal. The row still reaches the engine VERBATIM and
    // still halts the run with `RECEIPT_UNCLASSIFIED`; it is simply not described as something it is
    // not. No money moves either way — the honesty of the diagnostic is the whole change.
  }
  if (capitalReceiptIds.length > 0) {
    diagnostics.push(
      mappingDiagnostic('CAPITAL_RECEIPTS_PASSED_TO_ENGINE', 'NOTICE', {
        waqfId: waqf.id,
        capitalReceiptIds: capitalReceiptIds.join(','),
        engineFlagExpected: 'CAPITAL_RECEIPTS_EXCLUDED',
        rule: 'capital (asl) receipts are shown to the engine so it excludes them VISIBLY, with their ids',
      }),
    );
  }

  const operating = resolveOperatingCost(waqf.id, kept);
  diagnostics.push(...operating.diagnostics);

  /* ── 5 · the two deed-set deductions ──────────────────────────────────────────────────────── */
  const maintenance = resolveMaintenanceRule({
    waqfId: waqf.id,
    deed: shart.maintenanceReserve,
    nazirDiscretionPercent: settings.maintenanceNazirDiscretionPercent?.v ?? null,
    reserveFundBalanceMinor,
  });
  diagnostics.push(...maintenance.diagnostics);

  const nazirFee = resolveNazirFee({
    waqfId: waqf.id,
    deed: shart.nazirFee,
    configuredPercentOfRevenue: settings.nazirFeePercentOfRevenue?.v ?? null,
  });
  diagnostics.push(...nazirFee.diagnostics);

  /* ── 6 · the roster ───────────────────────────────────────────────────────────────────────── */
  const mappedBeneficiaries = beneficiaries.map((row) => mapBeneficiary(waqf.id, row));
  if (beneficiaries.length > 0) {
    // Both of these are `null` for every member because NO COLUMN EXISTS. Named, not inherited:
    // without a source, the ENTITY_UNLICENSED gate cannot fire from database data and a PAID line
    // carries no target reference (BR-501). Owed to E5/E6 — i.e. to this sprint.
    diagnostics.push(
      mappingDiagnostic('DISBURSING_ENTITY_HAS_NO_COLUMN', 'NOTICE', {
        waqfId: waqf.id,
        beneficiaryCount: String(beneficiaries.length),
        consequence: 'the ENTITY_UNLICENSED gate cannot fire from database data',
      }),
      mappingDiagnostic('BANKING_REF_FOR_PROCEEDS_HAS_NO_COLUMN', 'NOTICE', {
        waqfId: waqf.id,
        beneficiaryCount: String(beneficiaries.length),
        consequence: 'a PAID line carries no target account reference (BR-501)',
      }),
    );
  }

  /* ── 7 · timing, policy, and the assembled object ─────────────────────────────────────────── */
  const asOfGregorian = civilDateFromInstant(now, RUN_AS_OF_TIME_ZONE);

  const input: DistributionInputRaw = {
    waqfId: waqf.id,
    classification: waqf.classification,
    waqfType: waqf.type,
    entitlementOrder: waqf.entitlementOrder,
    continuationStipulation: waqf.continuationStipulation,
    reversion,
    period: { start: period.start, end: period.end },
    fiscalYearEnd: waqf.fiscalYearEnd,
    disbursementSchedule: resolveDisbursementSchedule(waqf.id, shart.disbursementSchedule),
    revenue: { incomeMinor, receipts },
    operatingCostMinor: operating.operatingCostMinor,
    maintenance: maintenance.rule,
    nazirFee: nazirFee.rule,
    beneficiaries: mappedBeneficiaries,
    // ⚠ ONE INSTANT, BOTH CALENDARS, DERIVED FROM ONE SOURCE. The engine cross-checks
    // `toHijri(asOf.gregorian) === asOf.hijri`; deriving the Hijri half from the SAME civil date
    // (rather than from the instant in a possibly different zone) makes that check pass by
    // construction instead of by coincidence.
    asOf: { gregorian: asOfGregorian, hijri: toHijri(asOfGregorian) },
    deadline: {
      gregorian: deadline.gregorian,
      hijri: deadline.hijri,
      settingKey: DISTRIBUTION_WINDOW_SETTING_KEY,
      months: settings.distributionWindowMonths.v,
      // ⚠ verify — may be stale (confirm vs primary law). The 3-month post-FYE window is unverified
      // and the envelope carries that fact; it is read from the Setting, never asserted here.
      unverified: settings.distributionWindowMonths.unverified,
    },
    policy: {
      kycRefreshMonths: settings.kycRefreshMonths.v,
      // The registry holds the granularity as a JS number (an arithmetic knob, not money); the engine
      // holds every monetary quantity as halalas. `BigInt` is exact on an integer and is not a money
      // coercion — `assertInputConsistency` then refuses anything other than 1n outright.
      roundingUnitMinor: BigInt(settings.roundingUnitMinor.v),
      roundingMethod: settings.roundingMethod.v,
      bindingCalendar: settings.bindingCalendar.v,
      // ⚠ THE VERBATIM ⚠ MARKER, AND IT IS INSIDE THE HASHED BYTES. `policy.unverifiedNote` is copied
      // into `result.unverifiedNotes`, which `canonicalizeResult` walks — so changing this string
      // changes the digest a Nazir signs. `@qmulate/domain` holds TWO different markers (this one, and
      // a longer one private to `dates/deadline.ts`); this one is byte-pinned against the database
      // seed's `UNVERIFIED_NOTE`, and a test in this stage pins it again.
      unverifiedNote: UNVERIFIED_NOTE,
    },
  };

  return { input, diagnostics };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7 · The pieces
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * مآل الوقف, from the COLUMNS, cross-checked against the Json.
 *
 * The engine's `reversion` is two-state — `clause | null`, where `null` means *the deed positively
 * records no ultimate taker* (R7-c). The database has THREE states, and the third
 * (`reversionClauseCaptured = false`, "nobody has read the clause yet") has no representation at the
 * engine at all. That is by design: `contract.ts` says the un-read state *"is refused at the mapping
 * boundary, so the un-read state can never masquerade as the deed's silence and no new engine
 * discriminator was minted for it."* This function is that boundary.
 */
function resolveReversion(
  waqf: WaqfRunRow,
  shart: ShartRunProjection,
  ultimateTakerIds: readonly string[],
): DistributionInputRaw['reversion'] {
  const expectedStatus = !waqf.reversionClauseCaptured
    ? 'unread'
    : waqf.reversionKind === null
      ? 'none'
      : 'named';

  if (shart.reversion.status !== expectedStatus) {
    throw mapperRefusal(
      'REVERSION_CLAUSE_DISAGREES_WITH_DEED_RECORD',
      `the مآل columns say the clause state is "${expectedStatus}" (reversionClauseCaptured=` +
        `${String(waqf.reversionClauseCaptured)}, reversionKind=${String(waqf.reversionKind)}) while ` +
        `shartAlWaqif.reversion.status says "${shart.reversion.status}". Where the endowment goes when ` +
        `the family ends is recorded twice and the two records disagree.`,
      {
        waqfId: waqf.id,
        columnState: expectedStatus,
        shartState: shart.reversion.status,
      },
    );
  }

  if (!waqf.reversionClauseCaptured) {
    throw mapperRefusal(
      'REVERSION_CLAUSE_UNREAD',
      "nobody has read this deed's مآل clause (Waqf.reversionClauseCaptured = false), so it can " +
        'neither be asserted that the founder named an ultimate taker nor that they named none. The ' +
        "engine's reversion input has only those two states, and passing `null` would make the run " +
        "assert the second on the deed's behalf.",
      { waqfId: waqf.id },
    );
  }

  if (waqf.reversionKind === null) {
    if (ultimateTakerIds.length > 0 || shart.reversion.ultimateTakerIds.length > 0) {
      throw mapperRefusal(
        'REVERSION_CLAUSE_DISAGREES_WITH_DEED_RECORD',
        `the deed records NO مآل kind, yet ${String(ultimateTakerIds.length)} waqf_reversion_taker ` +
          `row(s) and ${String(shart.reversion.ultimateTakerIds.length)} Json id(s) name ultimate ` +
          `takers. A named taker with no recorded kind is a half-written clause.`,
        { waqfId: waqf.id },
      );
    }
    // The deed POSITIVELY records no ultimate taker. A statement, not an omission.
    return null;
  }

  if (shart.reversion.kind !== waqf.reversionKind) {
    throw mapperRefusal(
      'REVERSION_CLAUSE_DISAGREES_WITH_DEED_RECORD',
      `Waqf.reversionKind is "${waqf.reversionKind}" and shartAlWaqif.reversion.kind is ` +
        `"${String(shart.reversion.kind)}".`,
      { waqfId: waqf.id, column: waqf.reversionKind, shart: String(shart.reversion.kind) },
    );
  }
  // ⚠ SORTED, NOT DEDUPLICATED. Sorting makes the hashed bytes reproducible (`WaqfReversionTaker` has
  // no ordering column); deduplicating would hide `REVERSION_ULTIMATE_TAKER_DUPLICATED`, and a repeat
  // MOVES MONEY because a taker's share is its deed weight.
  const columnIds = [...ultimateTakerIds].sort();
  const jsonIds = [...shart.reversion.ultimateTakerIds].sort();
  if (columnIds.length !== jsonIds.length || columnIds.some((id, index) => id !== jsonIds[index])) {
    throw mapperRefusal(
      'REVERSION_CLAUSE_DISAGREES_WITH_DEED_RECORD',
      `the waqf_reversion_taker rows name [${columnIds.join(', ')}] and shartAlWaqif.reversion names ` +
        `[${jsonIds.join(', ')}]. The clause decides who takes the endowment when the bloodline is ` +
        `over; two lists is not one clause.`,
      { waqfId: waqf.id },
    );
  }
  return { kind: waqf.reversionKind, ultimateTakerIds: columnIds };
}

/** What the operating-cost deduction consumed, and what it deliberately did not. */
interface OperatingCostResolution {
  readonly operatingCostMinor: bigint;
  readonly diagnostics: readonly MappingDiagnostic[];
}

/**
 * `operatingCostMinor` = Σ EXPENSE rows whose `expenseCategory` is `OPERATIONS`. Nothing else.
 *
 * Every other category is EXCLUDED and NAMED, never folded in:
 *  · `MAINTENANCE` is a PAID cost, not the reserve. The reserve comes from the deed's rule, and
 *    `@qmulate/domain/ledger` carries `EXP_SIYANA_IS_NOT_A_RESERVE` for exactly this confusion. Adding
 *    the two would deduct ṣiyāna twice.
 *  · `NAZIR_FEE` is COMPUTED by the engine at waterfall step 3. Reading it from cash as well would
 *    deduct the trustee's fee twice — `waqf-001` has both a 10%-of-revenue deed term and a paid
 *    `nazir_fee` expense row in the same period, so this is a live trap, not a hypothetical one.
 *  · `ZAKAT` is unruled (Q10). Whether zakat precedes distribution is a fiqh question.
 *  · `OTHER` and an absent category have no ruling either way, and folding an unclassified cost into
 *    the deduction that reduces every beneficiary's share is a decision dressed as plumbing.
 */
function resolveOperatingCost(
  waqfId: string,
  rows: readonly LedgerRunRow[],
): OperatingCostResolution {
  let operatingCostMinor = 0n;
  const excludedByCategory = new Map<string, bigint>();

  for (const row of rows) {
    if (row.type !== 'EXPENSE') continue;
    const amountMinor = sarToMinor(asMoneyInput(row.amountSar), `${row.id}.amountSar`);
    if (row.expenseCategory === 'OPERATIONS') {
      operatingCostMinor += amountMinor;
      continue;
    }
    const key = row.expenseCategory ?? 'UNCATEGORISED';
    excludedByCategory.set(key, (excludedByCategory.get(key) ?? 0n) + amountMinor);
  }

  const diagnostics = [...excludedByCategory.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([category, total]) =>
      mappingDiagnostic('OPERATING_COST_EXPENSE_CATEGORY_EXCLUDED', 'NOTICE', {
        waqfId,
        expenseCategory: category,
        excludedTotalSar: minorToDecimalString(minorOf(total)),
        rule: 'operatingCostMinor is the sum of OPERATIONS expenses only',
      }),
    );

  return { operatingCostMinor, diagnostics };
}

/** One `Beneficiary` row as the engine consumes it. No field is defaulted. */
function mapBeneficiary(
  waqfId: string,
  row: BeneficiaryRunRow,
): DistributionInputRaw['beneficiaries'][number] {
  if (row.stipulatedWeight === null) {
    throw mapperRefusal(
      'BENEFICIARY_WEIGHT_MISSING',
      `beneficiary ${row.id} has no stipulatedWeight. The column is nullable because migration 12 ` +
        `refused to INVENT a weight for every existing row; this boundary refuses for the mirror ` +
        `reason — a substituted "1" would be code deciding a deed-stipulated share.`,
      { waqfId, beneficiaryId: row.id },
    );
  }
  const weight = String(row.stipulatedWeight);
  if (!PLAIN_DECIMAL.test(weight)) {
    throw mapperRefusal(
      'BENEFICIARY_WEIGHT_UNREPRESENTABLE',
      `beneficiary ${row.id} has stipulatedWeight "${weight}", which is not a plain non-negative ` +
        `decimal literal. Exponent notation and negatives are refused rather than reinterpreted.`,
      { waqfId, beneficiaryId: row.id, received: weight },
    );
  }

  return {
    id: row.id,
    kind: row.kind,
    active: row.active,
    tabaqa: row.tabaqa,
    parentId: row.parentId,
    lineageLink: row.lineageLink,
    line: row.line,
    branch: row.branch,
    stipulatedWeight: weight,
    verificationStatus: row.verificationStatus,
    // A UTC-midnight column read as a UTC civil date — the boundary conversion
    // `civilDateFromUtcDate` documents itself as. `null` stays `null`: it means NOBODY HAS REFRESHED
    // this KYC, which the engine gates as `KYC_UNVERIFIED` and never as `STALE_KYC`.
    kycLastRefreshed:
      row.kycLastRefreshed === null ? null : civilDateFromUtcDate(row.kycLastRefreshed),
    category: row.categoryDescriptionAr,
    residency: row.residency,
    // ⚠ NO COLUMN EXISTS for either. Reported as a diagnostic by the builder rather than silently null.
    disbursingEntity: null,
    bankingRefForProceeds: null,
  };
}

/** `'UNSPECIFIED'` ⇒ `null` (the post-FYE default window binds). Anything unknown is refused. */
function resolveDisbursementSchedule(
  waqfId: string,
  recorded: string | null,
): DistributionInputRaw['disbursementSchedule'] {
  if (recorded === null || recorded === 'UNSPECIFIED') return null;
  const known = (DISBURSEMENT_SCHEDULES as readonly string[]).includes(recorded);
  if (!known) {
    throw mapperRefusal(
      'DISBURSEMENT_SCHEDULE_UNRECOGNISED',
      `the deed records a disbursement schedule of "${recorded}", which this build does not ` +
        `recognise. Refused rather than treated as silence: silence makes the statutory post-FYE ` +
        `window bind, which is a different deadline from any schedule the deed might have set.`,
      { waqfId, disbursementSchedule: recorded },
    );
  }
  return recorded as DistributionInputRaw['disbursementSchedule'];
}

/** `null` stays `null`; anything the vocabulary does not hold goes through for the engine to refuse. */
function asCapitalSource(
  value: string | null,
): DistributionInputRaw['revenue']['receipts'][number]['capitalSource'] {
  if (value === null) return null;
  return (CAPITAL_SOURCES as readonly string[]).includes(value)
    ? (value as (typeof CAPITAL_SOURCES)[number])
    : // An unrecognised source cannot be forwarded (the field is a `z.enum`), and it must not become
      // `null` either — that would turn "this CAPITAL receipt names a source we do not know" into
      // "this CAPITAL receipt names none", which the engine refuses for a different reason. Refused here.
      unrecognisedCapitalSource(value);
}

function unrecognisedCapitalSource(value: string): never {
  throw mapperRefusal(
    'CAPITAL_SOURCE_UNRECOGNISED',
    `a receipt names capitalSource "${value}", which is not one of ` +
      `${CAPITAL_SOURCES.join(' | ')}. It is refused rather than nulled: "we do not recognise this ` +
      `corpus event" and "this capital receipt names no corpus event" are different facts, and the ` +
      `second is what the engine's RECEIPT_UNCLASSIFIED would report.`,
    { capitalSource: value },
  );
}

/**
 * Narrow a `Decimal`-or-string money column for `money()`.
 *
 * `money()` accepts `string | Decimal` and REFUSES a JS number by name (`MONEY_NUMBER_INPUT`), so this
 * only has to avoid stringifying a `Decimal` through a lossy path. `Decimal.prototype.toString` is
 * exact for the `Decimal(18,2)` range; `money()` then refuses exponent notation if one ever appears.
 */
function asMoneyInput(value: string | { toString(): string }): string {
  return typeof value === 'string' ? value : String(value);
}
