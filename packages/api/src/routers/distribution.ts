/**
 * `distribution` — E6/S7's RUN LIFECYCLE: the wiring that carries the record to the pure engine and
 * the engine's answer back into the database (BR-503, BR-505, BR-506; release gates G-3 and G-9).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE SHAPE, AND WHY IT IS FIVE VERBS AND NOT ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   preview   a QUERY. Computes and returns; writes NOTHING. Non-throwing: it answers
 *             `{ status: 'computed' } | { status: 'refused' }` so a refusal is DATA a screen can
 *             render, not an exception a client has to reverse-engineer. See "the refusal channel".
 *   create    a MAKER write. Persists the computed run as `COMPUTED`, with `engineVersion` and
 *             `runDigest` — the two facts that make the answer attributable to a build.
 *   submit    a MAKER write. Moves the run to `PENDING_APPROVAL` and mints ONE `DISTRIBUTION_RUN`
 *             approval whose `subjectId` IS the run's id.
 *   ‹approve› NOT HERE. `approval.approve` in `root.ts` is this package's ONE approving path.
 *   execute   a MAKER write. Verifies the approved artifact, then writes the line items and posts
 *             the run.
 *   get/list/lines  reads, split across TWO permissions on purpose (see the permission note).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE APPROVAL TYPE IS `DISTRIBUTION_RUN`, AND POSTGRES DECIDES THAT, NOT THIS FILE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The deferred constraint trigger `qmulate_distribution_authority`
 * (`migrations/00000000000004_e2_guard_gaps/migration.sql`) calls
 * `qmulate_approval_defect(NEW."approvalRequestId", NEW."waqfId", 'DISTRIBUTION_RUN', NEW."id", true)`
 * and raises SQLSTATE 42501 **at COMMIT** when the approval's type is anything else. A
 * `BANK_MOVEMENT` approval on this path therefore does not "work but read oddly" — it aborts the
 * transaction after every application-level check has passed. The S7 task brief's phrase
 * "BANK_MOVEMENT path" means the bank-movement *pattern* (`request → approval.approve → execute`),
 * which this file copies from `routers/finance.ts`, and NOT the bank-movement *type*.
 *
 * The same function also demands, all measured against migration 4's source: the approval is not
 * soft-deleted; its status is `APPROVED` **or** `EXECUTED` (`p_allow_spent := true`, because a run
 * and its approval reach their terminal states together); its `waqfId` matches; `checkerId` is
 * non-null and differs from `makerId`; and **`subjectId` equals the distribution row's own `id`**.
 *
 * ⚠ CONSEQUENCE FOR THE SUBJECT ID, AND IT IS A CHOICE THIS FILE MAKES VISIBLY.
 * `src/distribution/subject.ts` also ships a DETERMINISTIC subject id
 * (`distribution:run:<waqfId>:<periodEnd>`) and its own header records that the two designs
 * contradict each other. This file takes the other branch — `subjectId: run.id`, the cuid — for a
 * reason that is not taste:
 *   · the trigger above compares `subjectId` to `NEW."id"`, so a deterministic subject id would have
 *     to BE the primary key;
 *   · migration 21's partial unique index `distribution_one_live_run_per_period` is
 *     `("waqfId","periodStart","periodEnd") WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED'`,
 *     and its stated purpose is to PERMIT a fresh run after a cancellation — which a deterministic
 *     primary key makes impossible (the id is spent, and `distribution` refuses DELETE).
 * So period-uniqueness is held by that index, identity by the cuid, and the artifact bind by
 * `subjectId = run.id`. `distributionRunSubjectId` is consequently NOT called from this file; that
 * is reported as an unresolved seam rather than hidden behind an unused import.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE CORPUS WALL LIVES IN WHAT THE QUERY DOES **NOT** FILTER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `ledgerWindowWhere` carries no `receiptClass` filter, and that absence is the control. A router
 * that dropped CAPITAL rows first would still compute — and `capitalReceiptsMinor` would be `0`, the
 * `CAPITAL_RECEIPTS_EXCLUDED` flag would not be raised, and the `WATERFALL`/`CAPITAL_RECEIPTS_EXCLUDED`
 * trace step naming the excluded ids would not exist. The corpus would become INVISIBLE instead of
 * VISIBLY EXCLUDED, which is the difference between a wall and a habit. Capital (asl) receipts are
 * passed IN so the engine holds them out by name; `excludedCapitalReceipts` below carries those ids
 * to the wire from the INPUT, never parsed back out of the frozen trace prose.
 *
 * ⚠ AND THE SECOND ABSENT FILTER, ADDED 2026-08-20 BECAUSE ITS PRESENCE WAS A LIVE BREACH (AV7-F4).
 * `ledgerWindowWhere` also carries NO `deletedAt: null`. It used to, and one unapproved
 * `UPDATE "transaction" SET "deletedAt" = now()` on `qmulate_app` — the role this process itself
 * holds, measured through this router's own `ctx.db` in probe A-11 — reached exactly the state the
 * paragraph above forbids: `capitalReceiptsSar` 4,200,000.00 → 0.00, `CAPITAL_RECEIPTS_EXCLUDED`
 * absent, `excludedCapitalReceipts` empty, no diagnostic, no trace step, while the row still read
 * `CAPITAL / 4200000 / ISTIBDAL_PROCEEDS`. The wall was intact and the query looked away.
 *
 * Both halves are now closed and they are DIFFERENT layers on purpose. (1) Retiring a committed
 * ledger row is a RESERVED MATTER at the database (migration 25 — product owner, 2026-08-20, memo
 * "S7 · AV7-F4": uniform for income and capital, the class difference being in the refusal's stated
 * reason and never in its strictness). (2) A row retired by ANY route this trigger never saw — the
 * table owner, a future procedure — is now FETCHED, and `assertRowsInWindow` refuses the run by name
 * (`LEDGER_ROW_SOFT_DELETED`), naming the receipt's class, capital source, amount and retirement
 * instant. A gate alone would have left the run trusting a single side.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE REFUSAL CHANNEL — WHY `preview` DOES NOT THROW
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `src/trpc.ts`'s `errorFormatter` threads only `cause.code` and `cause.messageKey` onto the error
 * shape. `DomainError.details` — where the DISCRIMINATOR lives — does not cross the wire, and 26 of
 * the engine's refusals share the code `SHART_INCOMPLETE`. A UI branching on `apiCode` would
 * therefore see one code for twenty-six different reasons, and the only remaining way to tell them
 * apart would be to parse an English message string, whose contents are a per-call-site accident.
 * Widening the formatter is not the fix: it is pinned by several suites and affects every code in the
 * system. So `preview` returns the named refusal as DATA, on the `finance.reconcile`
 * `exceptions[].finding` precedent, and the MUTATIONS keep throwing (a write that refuses must not
 * look like a write that succeeded).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * PERMISSIONS — AND THE TWO PLACES THIS IS SURFACED RATHER THAN SETTLED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   preview / get / list   `distribution:run:read`        — 8 roles; NOT the beneficiary seat.
 *   lines                  `distribution:line_item:read`  — 9 roles, INCLUDING the beneficiary seat,
 *                          whose rows the force filter narrows to `beneficiaryId = self` (measured in
 *                          `extensions/scoping.ts`). The split is deliberate: a beneficiary may read
 *                          THEIR line and not the run.
 *   create                 `distribution:run:write`       — `finance` only.
 *   submit                 `distribution:run:initiate`    — authorized_rep, case_manager, finance.
 *   execute                `distribution:line_item:write` — `finance` only.
 *
 * ⚠ SURFACED, NOT SETTLED (1): `preview` COMPUTES, and it is gated on a `read` verb. It persists
 * nothing, so `read` is the honest verb for the act — but it means a `case_manager` can see what a
 * period would pay before any maker has drafted it. The alternative (`distribution:run:write`,
 * finance-only) would make the wizard's first screen unreachable for the seats that run an
 * engagement. Recorded here rather than decided quietly.
 *
 * ⚠ SURFACED, NOT SETTLED (2): `execute` declares `distribution:line_item:write` and ALSO moves the
 * run's own `status`, which `distribution:run:write` nominally governs. Both sit in the `finance`
 * preset and in no other, so nothing is loosened today; they would diverge only if a future role were
 * given one and not the other. This is the same shape `routers/finance.ts` records for
 * `distribution:bank_movement:approve` vs `approval:request:approve`.
 *
 * ⚠ AND: `distribution:run:approve` and `distribution:run:sign` are registered, `nazir`-only, and are
 * held by NO procedure — here or anywhere. The run's checker gate is `approval:request:approve`,
 * because `approval.approve` is the one approving path. Recorded, not resolved.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE STATUS LATTICE FORCES `execute` TO MAKE TWO MOVES, AND THAT IS NOT A SHORTCUT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `distribution_status_transition` (migration 3) permits `PENDING_APPROVAL → APPROVED` and
 * `APPROVED → EXECUTED` and nothing that skips a rung; `EXECUTED` and `CANCELLED` are terminal; and
 * there is NO `REJECTED` — a rejected run is `CANCELLED`. Since `approval.approve` decides the
 * APPROVAL and deliberately knows nothing about this table, the run's own `APPROVED` state is a
 * PROJECTION of that decision, and `execute` makes both moves inside ONE audited transaction. What
 * keeps the projection honest is not this comment: the deferred `distribution_authority` trigger
 * re-verifies the whole approval against the committed row, so a run cannot reach `APPROVED` by
 * assertion. The alternative — a `distribution.markApproved` on the checker rung — is a second
 * approving path, which `root.ts` argues against at length.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ EVERY FIGURE THIS FILE RETURNS IS UNVERIFIED (binding rule 3)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The 10% ʿushr, the 3-month post-FYE window, `EARLIER_OF`, the 12-month KYC interval: each is read
 * from a `Setting` and each envelope carries its own `unverified` flag and ⚠ note. `flags`,
 * `unverifiedNotes` and `timing.unverifiedNote` are returned verbatim so a surface can render the
 * caveat beside the number. `UNVERIFIED_FIGURES_APPLIED` is on EVERY run by construction and must
 * never be rendered as exceptional.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

import { isSelfApprovalExempt, recordEvent } from '@qmulate/database';
import { hasDomainCode, isDomainError } from '@qmulate/domain';
import {
  buildHolidayCalendar,
  civilDate,
  civilDateFromUtcDate,
  civilDateToUtcDate,
  computeDeadline,
  formatHijriDate,
  hijriMonthLength,
  toHijri,
  toHijriParts,
  type CivilDate,
  type HijriDate,
  type HolidayCalendar,
} from '@qmulate/domain/dates';
import { money, toDbString } from '@qmulate/domain/money';
import {
  ENGINE_VERSION,
  canonicalizeResult,
  minorToDecimalString,
  runDistribution,
  type DistributionInputRaw,
  type DistributionResult,
} from '@qmulate/domain/distribution';

import { ApiError, toTRPCError } from '../errors.js';
import { toActorContext } from '../context.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import { createSettingResolver, type SettingResolver } from '../settings.js';
import { assertOnboardingGateAllows } from '../middleware/onboarding-gate.js';
import { endowmentScopedProcedure, makerProcedure, router } from '../trpc.js';
import { mintApprovalRequest } from './reservedMatter.js';
import {
  DISTRIBUTION_RUN_APPROVAL_TYPE,
  DISTRIBUTION_RUN_ARTIFACT_KIND,
} from '../distribution/subject.js';
import {
  buildDistributionInput,
  ledgerWindowWhere,
  periodWindow,
  DISTRIBUTION_WINDOW_SETTING_KEY,
  type BeneficiaryRunRow,
  type DistributionMapping,
  type DistributionRunSettings,
  type LedgerRunRow,
  type WaqfRunRow,
} from '../distribution/input.js';
import { resolveRefusal, type MappingDiagnostic } from '../distribution/refusal.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Input shapes
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `yyyy-MM-dd`, the civil-date spelling every other boundary in this package uses. */
const civilDateInput = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    'a run period bound is a civil date, yyyy-MM-dd. The engine brands it as a CivilDate and both ' +
      'halves of every dual date are derived from it, so an instant with a time of day here would ' +
      'silently move a fiscal period by up to a day.',
  );

/**
 * The period a run covers. **The database has no source for it** — no column anywhere records which
 * window a Nazir is distributing — so it is caller input by design, and `assertInputConsistency`
 * enforces `start <= end` at the engine.
 */
const runPeriodInput = {
  periodStart: civilDateInput,
  periodEnd: civilDateInput,
};

const distributionIdInput = z.string().min(1).max(128);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Reading the record — one loader, shared by `preview` and `create`
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ THE `Setting` KEYS A RUN NEEDS, SPLIT INTO REQUIRED AND LEGITIMATELY-ABSENT.
 *
 * A miss on any of the first group is FATAL and stays fatal (`SETTING_MISSING`) — an engine handed a
 * substituted default for a statutory window produces a confidently wrong deadline. The two in the
 * second group have NO global row on purpose, so `null` is a real recorded state ("the Nazir has
 * recorded no ṣiyāna discretion for this endowment") rather than a resolver failure.
 */
const REQUIRED_SETTING_KEYS = [
  'kyc.refreshIntervalMonths',
  'distribution.rounding.unitMinor',
  'distribution.rounding.method',
  'distribution.deadline.bindingCalendar',
  'deadline.DISTRIBUTE_3M_FYE.months',
  'calendar.workweek',
] as const;

/** `SETTING_MISSING` → `null`; anything else propagates. See {@link REQUIRED_SETTING_KEYS}. */
async function optionalSetting<
  K extends 'distribution.maintenance.nazirDiscretionPercent' | 'nazirFee.percentOfRevenue',
>(
  resolver: SettingResolver,
  key: K,
  waqfId: string,
): Promise<Awaited<ReturnType<SettingResolver['get']>> | null> {
  try {
    return await resolver.get(key, { waqfId });
  } catch (error) {
    if (hasDomainCode(error, 'SETTING_MISSING')) return null;
    throw error;
  }
}

/**
 * The KSA business-day calendar, built from the seeded `holiday_calendar` rows and the workweek
 * `Setting`.
 *
 * ⚠ `coverage` IS DERIVED FROM THE ROWS, NEVER WIDENED. `buildHolidayCalendar` refuses a query
 * outside its coverage, so a coverage window wider than the rows would answer "no holiday" for a
 * year that simply was not seeded — a deadline off by a working day, silently, and only for the
 * years nobody loaded.
 */
async function loadHolidayCalendar(
  db: { holidayCalendar: { findMany: (args: unknown) => Promise<readonly HolidayRow[]> } },
  workweek: readonly string[],
): Promise<HolidayCalendar> {
  const rows = await db.holidayCalendar.findMany({
    select: { date: true, nameAr: true, nameEn: true, isWorkingDay: true },
    orderBy: { date: 'asc' },
  });
  if (rows.length === 0) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      'DISTRIBUTION_RUN_NOT_COMPUTABLE: holiday_calendar has no rows, so no business-day answer is ' +
        'available and the post-FYE deadline would be a guess. The calendar is seeded data, not a ' +
        'default this layer may invent.',
      { reason: 'CALENDAR_UNAVAILABLE' },
    );
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first === undefined || last === undefined) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      'DISTRIBUTION_RUN_NOT_COMPUTABLE: calendar rows vanished ' +
        'between the count and the read.',
      { reason: 'CALENDAR_UNAVAILABLE' },
    );
  }
  return buildHolidayCalendar({
    workweek: workweek as never,
    coverage: { from: civilDateFromUtcDate(first.date), to: civilDateFromUtcDate(last.date) },
    observed: rows
      .filter((row) => !row.isWorkingDay)
      .map((row) => ({
        date: civilDateFromUtcDate(row.date),
        nameAr: row.nameAr,
        nameEn: row.nameEn ?? row.nameAr,
      })),
    workingDayOverrides: rows
      .filter((row) => row.isWorkingDay)
      .map((row) => ({
        date: civilDateFromUtcDate(row.date),
        // `isWorkingDay: true` is the discriminator the domain's own type requires; `reason` is a
        // single free-text field there, and the Arabic is the authoritative half (NFR-01).
        isWorkingDay: true as const,
        reason: row.nameAr,
      })),
  });
}

interface HolidayRow {
  readonly date: Date;
  readonly nameAr: string;
  readonly nameEn: string | null;
  readonly isWorkingDay: boolean;
}

/**
 * ⚠ ADDING WHOLE MONTHS IN THE HIJRI CALENDAR, WITH THE SAME CLAMP THE GREGORIAN SIDE USES.
 *
 * `@qmulate/domain/dates` exports `addCalendarMonths` for Gregorian and has NO Hijri equivalent, so
 * this walks the Umm al-Qura table directly: month lengths come from `hijriMonthLength`, and a day
 * that does not exist in the target month is clamped DOWN (30 Muharram + 1 month into a 29-day Safar
 * is 29 Safar, never 1 Rabiʿ I). Overflowing instead of clamping is the "two days late, silently,
 * every year" failure `dates/deadline.ts` names in its own header.
 *
 * ⚠ ITS HOME IS ARGUABLY `packages/domain/src/dates/hijri.ts`, and it is here only because that file
 * is outside this stage's file list. Reported as owed, not disguised.
 */
function addHijriMonths(from: CivilDate, months: number): HijriDate {
  const parts = toHijriParts(from);
  let year = parts.hy;
  let month = parts.hm + months;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  const day = Math.min(parts.hd, hijriMonthLength(year, month));
  return formatHijriDate({ hy: year, hm: month, hd: day });
}

/**
 * The post-FYE distribution deadline, as TWO INDEPENDENT DAYS.
 *
 * The Gregorian half is `FYE + N calendar months` rolled onto a KSA business day; the Hijri half is
 * `Hijri(FYE) + N Hijri months`, unrolled. They are DIFFERENT DAYS on purpose and the engine
 * deliberately does not cross-check them — `bindingCalendar` decides which one binds, and on
 * `EARLIER_OF` the earlier of the two wins.
 *
 * ⚠ `monthAnchor` IS A LEGAL CHOICE WITH NO DEFAULT, AND THIS IS ENGINEERING'S READING OF IT.
 * `dates/deadline.ts` refuses to pick: "within 3 months of the end of the fiscal year" reads either
 * as the same day of month three months on (`day_of_month`) or as the END of the third month
 * (`end_of_month`), and a fiscal year end is always a month end so the two differ by up to three
 * days exactly where it matters. `day_of_month` is used here.
 * ⚠ MEASURED, so the choice is not load-bearing for the fixture: for a `12-31` fiscal year end the
 * two readings give the SAME day (2026-12-31 + 3 → 2027-03-31 either way), because March has 31
 * days. It becomes load-bearing on a 30-November or 30-September year end, and it is SURFACED for the
 * product owner rather than settled here.
 *
 * ⚠ The anchor is the fiscal year end IN THE YEAR THE PERIOD ENDS. A period ending 2026-03-31 on a
 * `12-31` deed is measured from 2026-12-31 — the end of the fiscal year the period belongs to, not
 * the most recent one that has passed.
 */
function runDeadline(args: {
  readonly fiscalYearEnd: string;
  readonly periodEnd: string;
  readonly months: number;
  readonly unverified: boolean;
  readonly calendar: HolidayCalendar;
}): { readonly gregorian: string; readonly hijri: string } {
  const [month, day] = args.fiscalYearEnd.split('-');
  if (month === undefined || day === undefined) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `DISTRIBUTION_RUN_NOT_COMPUTABLE: fiscalYearEnd ${JSON.stringify(args.fiscalYearEnd)} is not ` +
        `"MM-DD", so the post-FYE window has no anchor.`,
      { reason: 'FISCAL_YEAR_END_UNREADABLE' },
    );
  }
  const anchor = civilDate(`${args.periodEnd.slice(0, 4)}-${month}-${day}`);
  const computed = computeDeadline({
    from: anchor,
    window: {
      settingKey: DISTRIBUTION_WINDOW_SETTING_KEY,
      calendarMonths: args.months,
      // See the docstring: a legal choice, surfaced, and provably not load-bearing on a 12-31 FYE.
      monthAnchor: 'day_of_month',
      unverified: args.unverified,
    },
    calendar: args.calendar,
    roll: 'following',
  });
  return { gregorian: computed.due.gregorian, hijri: addHijriMonths(anchor, args.months) };
}

/** Everything one run reads, assembled and handed to the pure mapper. */
async function assembleRun(
  ctx: { readonly db: ExtendedDb; readonly waqfId: string; readonly now: Date },
  period: { readonly start: string; readonly end: string },
): Promise<{ readonly mapping: DistributionMapping; readonly result: DistributionResult }> {
  const waqf = (await ctx.db.waqf.findFirst({
    where: { id: ctx.waqfId, deletedAt: null },
    select: {
      id: true,
      classification: true,
      type: true,
      entitlementOrder: true,
      continuationStipulation: true,
      fiscalYearEnd: true,
      reversionClauseCaptured: true,
      reversionKind: true,
      shartAlWaqif: true,
    },
  })) as WaqfRunRow | null;

  if (waqf === null) {
    // The force filter already narrows this read to the caller's endowments, so a null here is
    // "not visible", which is the same answer as "does not exist" (§10 principle 2).
    throw new ApiError('NO_GRANT', `no waqf ${ctx.waqfId} is visible to this caller.`, {
      waqfId: ctx.waqfId,
    });
  }

  const beneficiaries = (await ctx.db.beneficiary.findMany({
    where: { waqfId: ctx.waqfId, deletedAt: null },
    select: {
      id: true,
      kind: true,
      active: true,
      tabaqa: true,
      parentId: true,
      lineageLink: true,
      line: true,
      branch: true,
      stipulatedWeight: true,
      verificationStatus: true,
      kycLastRefreshed: true,
      categoryDescriptionAr: true,
      residency: true,
    },
    // Determinism: the beneficiary array's order is inside the canonical bytes a Nazir signs.
    orderBy: { id: 'asc' },
  })) as readonly BeneficiaryRunRow[];

  const takers = await ctx.db.waqfReversionTaker.findMany({
    where: { waqfId: ctx.waqfId },
    select: { beneficiaryId: true },
    // `waqf_reversion_taker` has no ordering column, so the order is imposed here; a repeat is NOT
    // deduplicated — the engine refuses it by name (`REVERSION_ULTIMATE_TAKER_DUPLICATED`).
    orderBy: { beneficiaryId: 'asc' },
  });

  const window = periodWindow(period.start, period.end);
  // ⚠ NO `receiptClass` FILTER, NO REVERSAL FILTER AND — SINCE AV7-F4 — NO `deletedAt` FILTER.
  // All three absences are controls, not oversights: see the file header on the corpus wall,
  // `excludeReversedPairs` on why the reversal rows must be VISIBLE to be excluded, and
  // `ledgerWindowWhere`'s own docstring for the measurement that removed the third. A retired row
  // in the window reaches `assertRowsInWindow` and HALTS the run by name; it no longer vanishes.
  // ⚠ `deletedAt` STAYS IN THE `select` BELOW, AND THAT IS NOW LOAD-BEARING RATHER THAN INCIDENTAL:
  // the refusal reads the column to report WHEN the row was retired.
  const ledger = (await ctx.db.transaction.findMany({
    where: ledgerWindowWhere({ waqfId: ctx.waqfId, window }),
    select: {
      id: true,
      type: true,
      receiptClass: true,
      capitalSource: true,
      expenseCategory: true,
      amountSar: true,
      date: true,
      reversalOfId: true,
      deletedAt: true,
    },
    orderBy: { id: 'asc' },
  })) as readonly LedgerRunRow[];

  const resolver = createSettingResolver(ctx.db as never, { now: ctx.now });
  const required = await resolver.getMany(REQUIRED_SETTING_KEYS, { waqfId: ctx.waqfId });
  const settings: DistributionRunSettings = {
    kycRefreshMonths: required['kyc.refreshIntervalMonths'],
    roundingUnitMinor: required['distribution.rounding.unitMinor'],
    roundingMethod: required['distribution.rounding.method'],
    bindingCalendar: required['distribution.deadline.bindingCalendar'],
    distributionWindowMonths: required['deadline.DISTRIBUTE_3M_FYE.months'],
    maintenanceNazirDiscretionPercent: (await optionalSetting(
      resolver,
      'distribution.maintenance.nazirDiscretionPercent',
      ctx.waqfId,
    )) as DistributionRunSettings['maintenanceNazirDiscretionPercent'],
    nazirFeePercentOfRevenue: (await optionalSetting(
      resolver,
      'nazirFee.percentOfRevenue',
      ctx.waqfId,
    )) as DistributionRunSettings['nazirFeePercentOfRevenue'],
  };

  const calendar = await loadHolidayCalendar(ctx.db as never, required['calendar.workweek'].v);
  const deadline = runDeadline({
    fiscalYearEnd: waqf.fiscalYearEnd,
    periodEnd: period.end,
    months: settings.distributionWindowMonths.v,
    unverified: settings.distributionWindowMonths.unverified,
    calendar,
  });

  const mapping = buildDistributionInput({
    waqf,
    beneficiaries,
    ultimateTakerIds: takers.map((taker) => taker.beneficiaryId),
    ledger,
    settings,
    period,
    deadline,
    // THE REQUEST'S SINGLE CLOCK READ. `asOf` decides `daysUntilDeadline` and therefore whether a
    // Nazir is reported late, so it is never re-read inside the computation.
    now: ctx.now,
  });

  return { mapping, result: runDistribution(mapping.input) };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The digest, and the projection that crosses the wire
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `sha256_hex(utf8(canonicalizeResult(result)))` — THE ARTIFACT THE NAZIR SIGNS.
 *
 * ⚠ TWO CANONICAL FORMS ARE IN PLAY AND THE BOUNDARY IS DELIBERATE. `canonicalizeResult` is the
 * ENGINE's canonicalisation of a run result (`packages/domain/src/distribution/trace.ts`) and it is
 * the only thing hashed here. `approvalFingerprint` — which `mintApprovalRequest` applies to the
 * approval PAYLOAD — runs `@qmulate/database`'s own `canonicalJson` over a different, much smaller
 * object that CONTAINS this hex string. Each canonicaliser walks the object it was written for; the
 * alternative (letting `canonicalJson` walk the whole result) would put two competing definitions of
 * "the bytes" over one artifact.
 *
 * `ENGINE_VERSION` is inside these bytes twice — `result.engineVersion` and the INPUT trace step's
 * `data.engineVersion` — so the version is a BYTE of the digest, not a label beside it.
 * ⚠ Every trace `message` and every `AuthorityNotice.reason` is inside them too. That is frozen
 * copy: a typo fix changes every stored digest, and whether a Nazir's signature should cover
 * developer-facing English at all is an open question for the product owner, deliberately not
 * answered by narrowing the canonical form here.
 */
function runDigestOf(result: DistributionResult): string {
  return createHash('sha256').update(canonicalizeResult(result), 'utf8').digest('hex');
}

/** Halalas → the exact 2-dp decimal string a `Decimal(18,2)` column and the wire both take. */
const sar = (minor: bigint): string => minorToDecimalString(minor as never);

/**
 * A `Decimal(18,2)` READ BACK → the same canonical 2-dp string.
 *
 * ⚠ NOT `decimal.toString()`, AND THE DIFFERENCE IS NOT COSMETIC. Prisma's `Decimal` drops trailing
 * zeros, so a stored `275000.00` prints as `"275000"` and `275000.10` prints as `"275000.1"`. Two
 * consequences, one of them load-bearing: a client would have to re-format every figure it displays,
 * and — worse — the approval payload's money strings are hashed into `payloadHash`, so a payload
 * written from `.toString()` could not be reproduced from a freshly formatted read of the same row.
 * `toDbString` is the domain's own boundary formatter and the one `routers/finance.ts` uses.
 */
const dbSar = (value: { readonly toString: () => string }): string =>
  toDbString(money(value.toString()));

/**
 * A share percentage at the engine's FIXED six decimals.
 *
 * ⚠ WHY THIS IS HAND-ROLLED. `SHARE_PERCENT_SCALE` is 6 and `sharePercentOf()` returns a `toFixed(6)`
 * string, so `50` and `50.000000` are the same number and DIFFERENT statement text — and migration 21
 * widened the column from `Decimal(9,4)` precisely because two digits of that text were being dropped.
 * `Decimal.toString()` drops the trailing zeros again on the way out. The obvious fix, `.toFixed(6)`,
 * is BANNED in this package by a source scan in `test/procedure-ladder.test.ts` (money must never
 * round through a float), and the ban is right even though a share percentage is not money — so the
 * padding is done on the string, where nothing can round.
 *
 * ⚠ This is display-only and never a base for an allocation: the money is allocated in integer
 * halalas by largest remainder, and this figure is what a beneficiary READS.
 */
function sharePercentString(value: { readonly toString: () => string }): string {
  const text = value.toString();
  const [whole, fraction = ''] = text.split('.');
  return `${String(whole)}.${fraction.padEnd(SHARE_PERCENT_DISPLAY_SCALE, '0').slice(0, SHARE_PERCENT_DISPLAY_SCALE)}`;
}

/** The engine's `SHARE_PERCENT_SCALE`, restated here only because the constant is not exported. */
const SHARE_PERCENT_DISPLAY_SCALE = 6;

/**
 * The run as it crosses the tRPC boundary.
 *
 * ⚠ MONEY IS A 2-dp DECIMAL STRING, NEVER A NUMBER AND NEVER A `bigint`. There is deliberately no
 * tRPC transformer, so a `bigint` would not serialize at all and a JS number would be a float in a
 * fiduciary figure. `sharePercent` is passed through at the engine's own SIX decimals, verbatim.
 *
 * ⚠ THE TRACE CROSSES WITHOUT ITS `message`. Trace messages are developer-facing English inside the
 * hashed bytes — frozen copy, not copy — and no surface may render them; what a screen needs is the
 * `stage`, the `code` and the `data`, which is what a `<DiagnosticCode>` renders from.
 */
function projectRun(mapping: DistributionMapping, result: DistributionResult, digest: string) {
  const capitalReceipts = mapping.input.revenue.receipts.filter(
    (receipt) => receipt.receiptClass !== 'INCOME',
  );
  return {
    engineVersion: result.engineVersion,
    runDigest: digest,
    waqfId: result.waqfId,
    distributionType: result.distributionType,
    classification: result.classification,
    waqfType: result.waqfType,
    entitlementOrder: result.entitlementOrder,
    entitlementRule: result.entitlementRule,
    period: { start: result.period.start, end: result.period.end },
    waterfall: {
      revenueSar: sar(result.waterfall.revenueMinor),
      /** ⚠ CORPUS. In no figure below it, and reported so it is visibly excluded rather than absent. */
      capitalReceiptsSar: sar(result.waterfall.capitalReceiptsMinor),
      maintenanceReserveSar: sar(result.waterfall.maintenanceReserveMinor),
      operatingSar: sar(result.waterfall.operatingCostMinor),
      netIncomeSar: sar(result.waterfall.netIncomeMinor),
      nazirFeeSar: sar(result.waterfall.nazirFeeMinor),
      nazirFeeBasis: result.waterfall.nazirFeeBasis,
      distributableSar: sar(result.waterfall.distributableMinor),
    },
    /** The asl receipts the engine held out, BY ID — from the input, never parsed out of the trace. */
    excludedCapitalReceipts: capitalReceipts.map((receipt) => ({
      transactionId: receipt.id,
      receiptClass: receipt.receiptClass,
      capitalSource: receipt.capitalSource ?? null,
      amountSar: sar(receipt.amountMinor as bigint),
    })),
    totals: {
      paidSar: sar(result.totals.paidMinor),
      withheldSar: sar(result.totals.withheldMinor),
      crossBorderSar: sar(result.totals.crossBorderMinor),
      retainedSar: sar(result.totals.retainedMinor),
      entitledSar: sar(result.totals.entitledMinor),
      excludedCount: result.totals.excludedCount,
      entitledLineCount: result.totals.entitledLineCount,
      residualSar: sar(result.totals.residualMinor),
    },
    lines: result.lines.map((line) => ({
      beneficiaryId: line.beneficiaryId,
      status: line.status,
      entitledSar: sar(line.entitledMinor),
      sharePercent: line.sharePercent,
      basis: line.basis,
      reasonCode: line.reasonCode,
      gateFlags: [...line.gateFlags],
      bankingRefForProceeds: line.bankingRefForProceeds,
    })),
    timing: result.timing,
    authorityNotices: result.authorityNotices.map((notice) => ({
      type: notice.type,
      beneficiaryId: notice.beneficiaryId,
      /** ⚠ RENDER FROM THE CODE. `notice.reason` is developer English and stays server-side. */
      reasonCode: notice.reasonCode,
    })),
    flags: [...result.flags],
    invariantsChecked: [...result.invariantsChecked],
    unverifiedNotes: [...result.unverifiedNotes],
    computationTrace: result.computationTrace.map((entry) => ({
      seq: entry.seq,
      stage: entry.stage,
      code: entry.code,
      data: entry.data ?? null,
    })),
    /** What the MAPPING saw that the engine cannot — outside the digest, on purpose. */
    diagnostics: mapping.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      detail: diagnostic.detail,
    })) as readonly MappingDiagnostic[],
  };
}

/**
 * The stored trace Json.
 *
 * ⚠ `computationTrace` IS STILL THE ONLY HOME for `flags`, `invariantsChecked`, `unverifiedNotes`,
 * `entitlementRule`, `timing.*`, the per-line `gateFlags` and the BR-505 `LineBasis` — migration 21
 * deliberately invented no columns for them, because each has a product half nobody has answered.
 *
 * ⚠ THE INPUT IS STORED VERBATIM, WITH MONEY AS EXACT HALALA INTEGER STRINGS. Reproducing a run
 * byte-for-byte needs the whole `DistributionInputRaw` — both halves of `asOf`, both halves of the
 * deadline, every `policy` field including the exact ⚠ note string, the full beneficiary array and
 * the full receipt list INCLUDING the capital rows. A halala count is written as its base-10 string
 * so `BigInt()` rehydrates it exactly; JSON has no bigint and a JS number would not survive.
 *
 * ⚠ AND A DISCLOSURE ASYMMETRY, REPORTED RATHER THAN INTRODUCED SILENTLY: `DistributionLineItem` is
 * narrowed to `beneficiaryId = self` for a beneficiary session by the force filter, while
 * `Distribution` is not narrowed at all — only the `distribution:run:read` permission (which the
 * beneficiary preset does not hold) keeps this Json out of a portal session. Defence in depth is one
 * layer short here; the fix belongs in `packages/database`'s scoping extension.
 */
function storedTrace(
  mapping: DistributionMapping,
  result: DistributionResult,
  digest: string,
): Record<string, unknown> {
  return {
    origin: 'e6-distribution',
    engineVersion: result.engineVersion,
    runDigest: digest,
    distributionType: result.distributionType,
    entitlementOrder: result.entitlementOrder,
    entitlementRule: result.entitlementRule,
    flags: [...result.flags],
    invariantsChecked: [...result.invariantsChecked],
    unverifiedNotes: [...result.unverifiedNotes],
    timing: { ...result.timing, asOf: { ...result.timing.asOf } },
    authorityNotices: result.authorityNotices.map((notice) => ({
      type: notice.type,
      beneficiaryId: notice.beneficiaryId,
      reasonCode: notice.reasonCode,
    })),
    totals: {
      paidSar: sar(result.totals.paidMinor),
      withheldSar: sar(result.totals.withheldMinor),
      crossBorderSar: sar(result.totals.crossBorderMinor),
      retainedSar: sar(result.totals.retainedMinor),
      entitledSar: sar(result.totals.entitledMinor),
      excludedCount: result.totals.excludedCount,
      entitledLineCount: result.totals.entitledLineCount,
      residualSar: sar(result.totals.residualMinor),
    },
    lines: result.lines.map((line) => ({
      beneficiaryId: line.beneficiaryId,
      status: line.status,
      entitledSar: sar(line.entitledMinor),
      sharePercent: line.sharePercent,
      basis: { ...line.basis },
      reasonCode: line.reasonCode,
      gateFlags: [...line.gateFlags],
    })),
    trace: result.computationTrace.map((entry) => ({
      seq: entry.seq,
      stage: entry.stage,
      code: entry.code,
      // ⚠ FROZEN COPY, stored because it is inside the digest. Never rendered.
      message: entry.message,
      data: entry.data ?? null,
    })),
    mappingDiagnostics: mapping.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      detail: diagnostic.detail,
    })),
    input: serializeInput(mapping.input),
  };
}

/** `DistributionInputRaw` with every halala count as its exact base-10 string. */
function serializeInput(input: DistributionInputRaw): unknown {
  return JSON.parse(
    JSON.stringify(input, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
  ) as unknown;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · Refusals
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The line items were not written, and the record says why — the `movementNotAuthorised` shape.
 *
 * ONE constructor for the whole ordered ladder, so every refusal on the execute path carries the same
 * machine reason and the specific defect is in `detail`. A caller cannot tell "no approval" from
 * "wrong endowment" by status code, which is deliberate: the endowment-disclosure rules apply here
 * too.
 */
function runNotAuthorised(waqfId: string, approvalRequestId: string, detail: string): ApiError {
  return new ApiError(
    'GATE_NOT_CLEARED',
    `DISTRIBUTION_RUN_NOT_AUTHORISED: a distribution run may not post without an APPROVED, ` +
      `maker <> checker DISTRIBUTION_RUN approval naming THIS run (§10 §4.2, BR-506, release gate ` +
      `G-3). waqf ${waqfId}, approvalRequestId ${approvalRequestId}: ${detail}.`,
    { waqfId, approvalRequestId, reason: 'DISTRIBUTION_RUN_NOT_AUTHORISED', detail },
  );
}

/** The run row is not in a state this verb can act on. Never a silent no-op. */
function runNotInState(waqfId: string, distributionId: string, detail: string): ApiError {
  return new ApiError(
    'GATE_NOT_CLEARED',
    `DISTRIBUTION_RUN_STATE_REFUSED: waqf ${waqfId}, distribution ${distributionId}: ${detail}. ` +
      `The status lattice is a database trigger (EXECUTED and CANCELLED are terminal, and there is ` +
      `no REJECTED — a rejected run is CANCELLED); refusing here means nothing is written and rolled ` +
      `back.`,
    { waqfId, distributionId, reason: 'DISTRIBUTION_RUN_STATE_REFUSED', detail },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · The router
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export const distributionRouter = router({
  /**
   * Compute a period's run and return it. **Writes nothing.**
   *
   * NON-THROWING on a refusal: see the file header. A `DomainError` from either side of the
   * boundary — the mapping's own eighteen refusals or the engine's twenty-six — comes back as
   * `{ status: 'refused', code, refusal, refusalSource, messageKey, details }`, where `refusal` is
   * the DISCRIMINATOR and is the only field that tells the twenty-six `SHART_INCOMPLETE`s apart. An
   * `ApiError` (a permission or configuration refusal) still THROWS: it is not a statement about the
   * founder's conditions and must not be rendered as one.
   */
  preview: endowmentScopedProcedure('distribution:run:read')
    .input(z.object(runPeriodInput))
    .query(async ({ ctx, input }) => {
      const period = { start: input.periodStart, end: input.periodEnd };
      try {
        const { mapping, result } = await assembleRun(ctx as never, period);
        return {
          status: 'computed' as const,
          run: projectRun(mapping, result, runDigestOf(result)),
        };
      } catch (error) {
        if (!isDomainError(error)) throw toTRPCError(error);
        const named = resolveRefusal(error);
        return {
          status: 'refused' as const,
          waqfId: ctx.waqfId,
          period,
          code: named.code,
          /** ⚠ `null` when the error carried no recognised discriminator — never inferred. */
          refusal: named.refusal,
          refusalSource: named.refusalSource,
          /** The ONE user-facing sentence's key, as the error itself declared it. */
          messageKey: named.messageKey,
          details: named.details,
        };
      }
    }),

  /**
   * Persist the computed run as `COMPUTED`, with `engineVersion` and `runDigest`.
   *
   * ⚠ `COMPUTED`, not `DRAFT`. `DRAFT` would say a human is still assembling it; this row carries a
   * full waterfall, a full line set and a digest, so the honest status is the one that says the
   * engine has answered. The lattice permits `COMPUTED → PENDING_APPROVAL`, which is `submit`.
   *
   * ⚠ A SECOND LIVE RUN FOR ONE PERIOD IS REFUSED BY THE DATABASE, not by this body: migration 21's
   * partial unique index `distribution_one_live_run_per_period` covers
   * `("waqfId","periodStart","periodEnd") WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED'`.
   * Two live runs are two answers to what the family is owed, chosen between by `ORDER BY` accident.
   */
  create: makerProcedure('distribution:run:write')
    .input(z.object(runPeriodInput))
    .mutation(async ({ ctx, input }) => {
      // ⊕ S12-3 · BR-1101 / V-11: no run is BORN while onboarding Gate 02 is not CLEARED. The
      // sentence here; the wall is migration 52's `distribution_onboarding_gate` on INSERT.
      await assertOnboardingGateAllows(ctx, 'DISTRIBUTION_RUN', 'distribution.create');
      const period = { start: input.periodStart, end: input.periodEnd };
      const { mapping, result } = await assembleRun(ctx as never, period);
      const digest = runDigestOf(result);

      const created = await auditedWrite(ctx.db, async (tx) => {
        // A `create` MAY project (no pre-image, so no diff can be falsified — C-08).
        return tx.distribution.create({
          data: {
            waqfId: ctx.waqfId,
            periodStart: civilDateToUtcDate(result.period.start),
            periodStartHijri: toHijri(result.period.start),
            periodEnd: civilDateToUtcDate(result.period.end),
            periodEndHijri: toHijri(result.period.end),
            grossRevenueSar: sar(result.waterfall.revenueMinor),
            reserveSar: sar(result.waterfall.maintenanceReserveMinor),
            operatingSar: sar(result.waterfall.operatingCostMinor),
            nazirFeeSar: sar(result.waterfall.nazirFeeMinor),
            distributableSar: sar(result.waterfall.distributableMinor),
            status: 'COMPUTED',
            // ⚠ NO DEFAULT ON EITHER COLUMN, BY DESIGN. NULL means nobody recorded one; it never
            // means "the current engine". Written here, at the one moment the value is known.
            engineVersion: result.engineVersion,
            runDigest: digest,
            computationTrace: storedTrace(mapping, result, digest) as never,
            createdBy: ctx.actor.actorId,
          },
          select: { id: true, status: true },
        });
      });

      return {
        distributionId: created.id,
        status: created.status,
        /** ⚠ Stated so no caller mistakes a computed run for a paid one. */
        lineItemsWritten: false as const,
        run: projectRun(mapping, result, digest),
      };
    }),

  /**
   * Move the run to `PENDING_APPROVAL` and mint the ONE `DISTRIBUTION_RUN` approval for it.
   *
   * Both happen inside ONE audited transaction: `mintApprovalRequest` opens its own `withAudit`,
   * which JOINS the enclosing one through the audit spine's `AsyncLocalStorage`, so the status move
   * and the approval commit together or not at all. A run sitting at `PENDING_APPROVAL` with no
   * approval, or an open approval for a run nobody submitted, are both states an operator would have
   * to unpick by hand.
   *
   * ⚠ `subjectId` IS THE RUN'S OWN ID, because `qmulate_distribution_authority` compares them. See
   * the file header.
   *
   * ⚠ THE PAYLOAD CARRIES `engineVersion` AND `runDigest`, AND THAT IS HOW THE ENGINE BUILD ENTERS
   * WHAT THE NAZIR SIGNS. `approvalFingerprint` hashes this payload into `payloadHash`; the checker's
   * approval is then bound to a specific build's answer, and a re-run under a different engine
   * version produces a different digest and voids the fingerprint instead of quietly executing.
   * Every value is a STRING or an array of strings — `canonicalJson` throws on a JS number, which is
   * what keeps a float out of the hash.
   */
  submit: makerProcedure('distribution:run:initiate')
    .input(z.object({ distributionId: distributionIdInput }))
    .mutation(async ({ ctx, input }) => {
      // ⊕ S12-3 · a gate REOPENED after a run was born still blocks its submission (BR-1101).
      await assertOnboardingGateAllows(ctx, 'DISTRIBUTION_RUN', 'distribution.submit');
      const run = await ctx.db.distribution.findFirst({
        where: { id: input.distributionId, waqfId: ctx.waqfId, deletedAt: null },
        select: {
          id: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          engineVersion: true,
          runDigest: true,
          grossRevenueSar: true,
          reserveSar: true,
          operatingSar: true,
          nazirFeeSar: true,
          distributableSar: true,
          computationTrace: true,
        },
      });
      if (run === null) {
        throw new ApiError(
          'NO_GRANT',
          `no distribution ${input.distributionId} on waqf ${ctx.waqfId} is visible to this caller.`,
          { waqfId: ctx.waqfId, distributionId: input.distributionId },
        );
      }
      if (run.status !== 'DRAFT' && run.status !== 'COMPUTED') {
        throw runNotInState(
          ctx.waqfId,
          run.id,
          `status is ${String(run.status)}; only a DRAFT or COMPUTED run may be submitted`,
        );
      }
      if (run.engineVersion !== null && run.engineVersion !== ENGINE_VERSION) {
        // ⚠ ENGINEERING'S FAIL-SAFE READING, SURFACED RATHER THAN SETTLED. A stored run carries the
        // build that produced it, and register item #13 is explicit that "a v3 run and a v4 run of ONE
        // register are not comparable" — memo Q5 changed the amounts a stored input produces and Q7
        // turned a computing run into a refusal. Minting an approval for a run this build no longer
        // produces would ask a Nazir to sign an answer nobody can reproduce, so it is refused and the
        // remedy is a recompute (which is cheap, reversible, and leaves the old run to be cancelled).
        // The alternative — submit it anyway and let the digest speak — is a product call, not a
        // mapping choice, and it is reported rather than taken here.
        throw runNotInState(
          ctx.waqfId,
          run.id,
          `it was computed by ${run.engineVersion} and this build is ${ENGINE_VERSION}. The engine ` +
            `version is a BYTE inside the digest a Nazir signs, so the two runs are not comparable; ` +
            `recompute the period rather than submitting an answer this build does not produce`,
        );
      }
      if (run.engineVersion === null || run.runDigest === null) {
        // A run with no recorded build and no digest cannot be bound to an approval: there would be
        // nothing for the fingerprint to attest to, and "the current engine" is exactly the claim the
        // absent `@default` exists to refuse.
        throw runNotInState(
          ctx.waqfId,
          run.id,
          `engineVersion or runDigest is NULL, so there is no artifact for an approval to bind to`,
        );
      }

      const trace =
        typeof run.computationTrace === 'object' && run.computationTrace !== null
          ? (run.computationTrace as Record<string, unknown>)
          : {};
      const flags = Array.isArray(trace['flags']) ? (trace['flags'] as unknown[]) : [];
      const invariants = Array.isArray(trace['invariantsChecked'])
        ? (trace['invariantsChecked'] as unknown[])
        : [];

      return auditedWrite(ctx.db, async (tx) => {
        // ⚠ NO `select` ON AN AUDITED `update` (C-08): the audit extension diffs a narrow post-image
        // against a full-row pre-image and records every dropped column as "set to null".
        await tx.distribution.update({
          where: { id: run.id },
          data: { status: 'PENDING_APPROVAL' },
        });

        const minted = await mintApprovalRequest(ctx as never, {
          waqfId: ctx.waqfId,
          type: DISTRIBUTION_RUN_APPROVAL_TYPE,
          // ⚠ NOT a derived string. The database compares this to the run row's own id.
          subjectId: run.id,
          payload: {
            kind: DISTRIBUTION_RUN_ARTIFACT_KIND,
            distributionId: run.id,
            waqfId: ctx.waqfId,
            engineVersion: run.engineVersion,
            runDigest: run.runDigest,
            periodStart: run.periodStart.toISOString(),
            periodEnd: run.periodEnd.toISOString(),
            // ⚠ CANONICAL 2-dp STRINGS, NOT `Decimal.toString()`. These are hashed into
            // `payloadHash`, so the spelling has to be reproducible from a fresh read of the row.
            grossRevenueSar: dbSar(run.grossRevenueSar),
            reserveSar: dbSar(run.reserveSar),
            operatingSar: dbSar(run.operatingSar),
            nazirFeeSar: dbSar(run.nazirFeeSar),
            distributableSar: dbSar(run.distributableSar),
            flags: flags.map((flag) => String(flag)),
            invariantsChecked: invariants.map((invariant) => String(invariant)),
          },
          procedure: 'distribution.submit',
        });

        return {
          distributionId: run.id,
          status: 'PENDING_APPROVAL' as const,
          approvalRequestId: minted.approvalRequestId,
          approvalStatus: minted.status,
          payloadHash: minted.payloadHash,
          lineItemsWritten: false as const,
        };
      });
    }),

  /**
   * Write the line items and post the run — the LAST step, and the only one that moves money on paper.
   *
   * ⚠ A `makerProcedure`, NOT a `checkerProcedure`, and the reason is measured rather than stylistic:
   * `checkerProcedure` runs `resolveApprover`, which requires the approval to still be `PENDING`,
   * while this path requires it to be `APPROVED`. The combination cannot succeed — the same trap
   * `asset.executeReservedAct` and `finance.bankMovement.execute` both avoid.
   *
   * THE LADDER, IN THIS ORDER, and step 1 is the TYPE because `approval.approve` does not check
   * `ctx.approval.type` at all and will happily approve a `DISTRIBUTION_RUN` or a `BANK_MOVEMENT`
   * alike. An approval raised for one act must never be spendable on another, and its `payloadHash`
   * still matches its OWN payload — so every later check looks healthy while the wrong thing is
   * authorised. The type is the only check that catches it.
   *   0 not visible                          → APPROVAL_NOT_VISIBLE
   *   1 type !== DISTRIBUTION_RUN             → WRONG_APPROVAL_TYPE
   *   2 status !== APPROVED                   → APPROVAL_NOT_USABLE
   *   3 waqfId !== ctx.waqfId                 → WRONG_ENDOWMENT
   *   4 checkerId null or === makerId         → SEGREGATION_OF_DUTIES
   *   5 stored payload fails re-validation    → APPROVED_ARTIFACT_UNREADABLE
   *   6 subjectId !== run.id                  → WRONG_SUBJECT
   *   7 payload's digest !== the run's digest → ARTIFACT_DIGEST_MISMATCH
   *   8 the stored artifact is not the approved one → STORED_RUN_* / LINE_TOTAL_* (see below)
   * Step 4 is belt over the CHECK `approval_request_checker_ne_maker` and the
   * `approval_request_authority` trigger, re-proven at spend time because an APPROVED row is durable
   * and this is the last moment before a payment is recorded as owed.
   *
   * ⚠ STEP 7 IS THE ONE THE BANK-MOVEMENT PATH HAS NO NEED OF. A bank movement's whole artifact is
   * inside the payload; a distribution run's artifact is a ROW, and the two must be compared or the
   * approval would bind to figures the run no longer carries. Neither `engineVersion` nor `runDigest`
   * is write-once at the database yet (measured: `distribution_status_transition` fires only when the
   * STATUS changes, so `UPDATE … SET "runDigest" = …` on a live run commits — migration 21's own
   * `TODO(surface)`, still owed, tracked as AV7-AUD-F4), so this comparison is the only thing
   * standing between an approved digest and a substituted one. Its failure direction is safe: a moved
   * `runDigest` makes this refuse.
   *
   * ⚠ AND STEP 7 WAS NOT ENOUGH, MEASURED. It compares the payload to two COLUMNS. The money used to
   * come from `computationTrace`, a third value nothing on this ladder looked at — so a Nazir's
   * approval of SAR 275,000.00 posted paid lines of SAR 1,137,499.00 (AV7-E), an `EXCLUDED` line was
   * flipped to `PAID` after approval (AV7-E2), and both writes succeeded on `qmulate_app`, the role
   * this process itself holds (AV7-E3). Step 8 closes it in the layer that spends the approval, and
   * migration 22 §1 closes it again in the layer that stores the run. Two layers because the trigger
   * covers UPDATE and not INSERT, and step 8 covers a fabricated row the trigger never sees.
   */
  execute: makerProcedure('distribution:line_item:write')
    .input(
      z.object({
        distributionId: distributionIdInput,
        approvalRequestId: z.string().min(1).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ⊕ S12-3 · and its execution (BR-1101, V-11 — "a distribution run is blocked").
      await assertOnboardingGateAllows(ctx, 'DISTRIBUTION_RUN', 'distribution.execute');
      const run = await ctx.db.distribution.findFirst({
        where: { id: input.distributionId, waqfId: ctx.waqfId, deletedAt: null },
        select: {
          id: true,
          waqfId: true,
          status: true,
          engineVersion: true,
          runDigest: true,
          distributableSar: true,
          computationTrace: true,
        },
      });
      if (run === null) {
        throw new ApiError(
          'NO_GRANT',
          `no distribution ${input.distributionId} on waqf ${ctx.waqfId} is visible to this caller.`,
          { waqfId: ctx.waqfId, distributionId: input.distributionId },
        );
      }
      if (run.status !== 'PENDING_APPROVAL') {
        throw runNotInState(
          ctx.waqfId,
          run.id,
          `status is ${String(run.status)}; only a PENDING_APPROVAL run may be posted`,
        );
      }

      const approval = await ctx.db.approvalRequest.findFirst({
        where: { id: input.approvalRequestId },
        select: {
          id: true,
          waqfId: true,
          type: true,
          status: true,
          subjectId: true,
          makerId: true,
          checkerId: true,
          payload: true,
        },
      });

      if (approval === null) {
        throw runNotAuthorised(ctx.waqfId, input.approvalRequestId, 'APPROVAL_NOT_VISIBLE');
      }
      if (approval.type !== DISTRIBUTION_RUN_APPROVAL_TYPE) {
        throw runNotAuthorised(
          ctx.waqfId,
          input.approvalRequestId,
          `WRONG_APPROVAL_TYPE: the approval is ${String(approval.type)}, not DISTRIBUTION_RUN. The ` +
            `deferred trigger qmulate_distribution_authority would raise 42501 at COMMIT anyway; ` +
            `refusing here means nothing is written and rolled back`,
        );
      }
      if (approval.status !== 'APPROVED') {
        throw runNotAuthorised(
          ctx.waqfId,
          input.approvalRequestId,
          `APPROVAL_NOT_USABLE: status is ${String(approval.status)}, not APPROVED`,
        );
      }
      if (approval.waqfId !== ctx.waqfId) {
        throw runNotAuthorised(
          ctx.waqfId,
          input.approvalRequestId,
          `WRONG_ENDOWMENT: the approval belongs to waqf ${approval.waqfId}`,
        );
      }
      // Migration 54: a checker the DATABASE names as self-approval-exempt (the fixture-only dev
      // admin) is the one case where checkerId === makerId is a legal, CHECK-admitted row.
      const selfApproved =
        approval.checkerId !== null &&
        approval.checkerId === approval.makerId &&
        !(await isSelfApprovalExempt(ctx.db, approval.checkerId));
      if (approval.checkerId === null || selfApproved) {
        throw runNotAuthorised(
          ctx.waqfId,
          input.approvalRequestId,
          `SEGREGATION_OF_DUTIES: maker ${approval.makerId} and checker ` +
            `${String(approval.checkerId)} are not two people`,
        );
      }

      const artifact = parseApprovedRun(
        typeof approval.payload === 'object' && approval.payload !== null
          ? (approval.payload as Record<string, unknown>)
          : {},
        ctx.waqfId,
        input.approvalRequestId,
      );
      if (approval.subjectId !== run.id) {
        throw runNotAuthorised(
          ctx.waqfId,
          input.approvalRequestId,
          `WRONG_SUBJECT: the approval names ${JSON.stringify(approval.subjectId)}, not this run ` +
            `${JSON.stringify(run.id)}`,
        );
      }
      if (artifact.distributionId !== run.id) {
        throw runNotAuthorised(
          ctx.waqfId,
          input.approvalRequestId,
          `WRONG_SUBJECT: the approved payload names distribution ` +
            `${JSON.stringify(artifact.distributionId)}, not ${JSON.stringify(run.id)}`,
        );
      }
      if (artifact.runDigest !== run.runDigest || artifact.engineVersion !== run.engineVersion) {
        throw runNotAuthorised(
          ctx.waqfId,
          input.approvalRequestId,
          `ARTIFACT_DIGEST_MISMATCH: the approval attests to ${artifact.engineVersion} / ` +
            `${artifact.runDigest} and the run now carries ${String(run.engineVersion)} / ` +
            `${String(run.runDigest)}. The Nazir approved a different answer`,
        );
      }

      // ── STEP 8 · THE LINE SET, RE-DERIVED FROM THE APPROVED ARTIFACT ────────────────────────
      // Not `readStoredLines(run.computationTrace)` any more. That read the money out of a Json no
      // comparison on this ladder touched — AV7-E/E2/E3, and the comment that used to defend it was
      // false. `authorisedLines` replays the run's own STORED INPUT (no ledger read), re-derives the
      // digest, refuses unless it reproduces the value step 7 just matched to the approval, and
      // asserts I2 against the persisted `distributableSar` before a halala is written.
      const lines = authorisedLines(run, ctx.waqfId, input.approvalRequestId);

      const posted = await auditedWrite(ctx.db, async (tx) => {
        // ── the lines, ONE `create` EACH ────────────────────────────────────────────────────
        // `createMany` is banned by the audit spine (no per-row result, so the created ids cannot be
        // recorded), and a relation-nested write into an audited model is refused outright: the trail
        // would name the parent row and never the child.
        const written: { readonly id: string; readonly beneficiaryId: string }[] = [];
        for (const line of lines) {
          const row = await tx.distributionLineItem.create({
            data: {
              // ⚠ FROM THE PARENT RUN, NEVER FROM THE BENEFICIARY. Migration 19's two composite FKs
              // tie `(waqfId, distributionId)` to the run AND `(waqfId, beneficiaryId)` to the
              // beneficiary, so taking this from the beneficiary row would be a constraint violation
              // on the endowment that matters and a silent pass on the one that does not.
              waqfId: run.waqfId,
              distributionId: run.id,
              beneficiaryId: line.beneficiaryId,
              // ⚠ EXPLICIT. The column defaults to PAID, so an EXCLUDED or WITHHELD line that
              // omitted it would be recorded as paid.
              status: line.status,
              // The engine's SIX decimals, verbatim. Migration 21 widened this column from (9,4),
              // which was dropping the last two digits of the percentage a beneficiary reads.
              sharePercent: line.sharePercent,
              amountSar: line.entitledSar,
              blockedReason: line.blockedReason,
              createdBy: ctx.actor.actorId,
            },
            select: { id: true, beneficiaryId: true },
          });
          written.push(row);
        }

        // ── the two status moves the lattice forces ─────────────────────────────────────────
        // PENDING_APPROVAL → APPROVED records, on the run, the decision `approval.approve` took on
        // the approval; the deferred `distribution_authority` trigger re-verifies that decision
        // against the committed row, so this is a projection the database checks rather than a claim
        // this code makes.
        await tx.distribution.update({
          where: { id: run.id },
          data: { status: 'APPROVED', approvalRequestId: approval.id },
        });
        // APPROVED → EXECUTED. `deriveAction` turns this one into `DISTRIBUTION_POST` on its own.
        await tx.distribution.update({
          where: { id: run.id },
          data: {
            status: 'EXECUTED',
            executedAt: ctx.now,
            executedAtHijri: toHijri(civilDateFromUtcDate(ctx.now)),
          },
        });
        // EXECUTED, not left APPROVED: a non-terminal approval keeps the one-open-per-subject slot
        // occupied and would block the next legitimate run on this subject — and it stops one
        // approval being spent twice.
        await tx.approvalRequest.update({
          where: { id: approval.id },
          data: { status: 'EXECUTED' },
        });

        return written;
      });

      await recordEvent(toActorContext(ctx, { procedure: 'distribution.execute' }), {
        action: 'DISTRIBUTION_POST',
        category: 'MUTATION',
        classification: 'SENSITIVE',
        entityType: 'Distribution',
        entityId: run.id,
        waqfId: ctx.waqfId,
        extraContext: {
          // The trail proves the AUTHORITY, not merely that rows appeared (BR-607, NFR-04).
          approvalRequestId: approval.id,
          approvalMakerId: approval.makerId,
          approvalCheckerId: approval.checkerId,
          engineVersion: String(run.engineVersion),
          runDigest: String(run.runDigest),
          distributableSar: dbSar(run.distributableSar),
          lineItemCount: String(posted.length),
        },
      });

      return {
        distributionId: run.id,
        status: 'EXECUTED' as const,
        approvalRequestId: approval.id,
        makerId: approval.makerId,
        checkerId: approval.checkerId,
        engineVersion: run.engineVersion,
        runDigest: run.runDigest,
        lineItemIds: posted.map((row) => row.id),
      };
    }),

  /** One persisted run, with everything migration 21 records about which build produced it. */
  get: endowmentScopedProcedure('distribution:run:read')
    .input(z.object({ distributionId: distributionIdInput }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.distribution.findFirst({
        where: { id: input.distributionId, waqfId: ctx.waqfId, deletedAt: null },
        select: {
          id: true,
          waqfId: true,
          periodStart: true,
          periodStartHijri: true,
          periodEnd: true,
          periodEndHijri: true,
          grossRevenueSar: true,
          reserveSar: true,
          operatingSar: true,
          nazirFeeSar: true,
          distributableSar: true,
          status: true,
          approvalRequestId: true,
          executedAt: true,
          executedAtHijri: true,
          engineVersion: true,
          runDigest: true,
          computationTrace: true,
        },
      });
      if (row === null) return null;
      return {
        distributionId: row.id,
        waqfId: row.waqfId,
        periodStart: row.periodStart.toISOString(),
        periodStartHijri: row.periodStartHijri,
        periodEnd: row.periodEnd.toISOString(),
        periodEndHijri: row.periodEndHijri,
        // ⚠ Money out as a 2-dp decimal STRING: a `Decimal` would reach the client as `{}` and a
        // number would be a float in a fiduciary figure.
        grossRevenueSar: dbSar(row.grossRevenueSar),
        reserveSar: dbSar(row.reserveSar),
        operatingSar: dbSar(row.operatingSar),
        nazirFeeSar: dbSar(row.nazirFeeSar),
        distributableSar: dbSar(row.distributableSar),
        status: row.status,
        approvalRequestId: row.approvalRequestId,
        executedAt: row.executedAt === null ? null : row.executedAt.toISOString(),
        executedAtHijri: row.executedAtHijri,
        /** ⚠ `null` means NOBODY RECORDED ONE — never "the current engine". */
        engineVersion: row.engineVersion,
        runDigest: row.runDigest,
        computationTrace: row.computationTrace,
      };
    }),

  /** Every live run for one endowment, newest period first. */
  list: endowmentScopedProcedure('distribution:run:read')
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.distribution.findMany({
        where: { waqfId: ctx.waqfId, deletedAt: null },
        select: {
          id: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          distributableSar: true,
          approvalRequestId: true,
          engineVersion: true,
          runDigest: true,
        },
        orderBy: [{ periodEnd: 'desc' }, { id: 'asc' }],
        take: input.limit,
      });
      return rows.map((row) => ({
        distributionId: row.id,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        status: row.status,
        distributableSar: dbSar(row.distributableSar),
        approvalRequestId: row.approvalRequestId,
        engineVersion: row.engineVersion,
        runDigest: row.runDigest,
      }));
    }),

  /**
   * One run's line items.
   *
   * ⚠ A DIFFERENT PERMISSION FROM `get`, ON PURPOSE. `distribution:line_item:read` is held by the
   * `beneficiary` preset and `distribution:run:read` is not, so a beneficiary may read their line
   * without reading the run — and the force filter narrows this table to `beneficiaryId = self` for
   * that seat, so "their line" is enforced below this layer as well as at it.
   */
  lines: endowmentScopedProcedure('distribution:line_item:read')
    .input(z.object({ distributionId: distributionIdInput }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.distributionLineItem.findMany({
        where: { distributionId: input.distributionId, waqfId: ctx.waqfId },
        select: {
          id: true,
          waqfId: true,
          distributionId: true,
          beneficiaryId: true,
          status: true,
          sharePercent: true,
          amountSar: true,
          blockedReason: true,
        },
        orderBy: { beneficiaryId: 'asc' },
      });
      return rows.map((row) => ({
        lineItemId: row.id,
        waqfId: row.waqfId,
        distributionId: row.distributionId,
        beneficiaryId: row.beneficiaryId,
        status: row.status,
        // SIX decimals, restored: the column is `Decimal(9,6)` since migration 21 and the figure a
        // beneficiary reads must match the run's own trace at every digit.
        sharePercent: sharePercentString(row.sharePercent),
        amountSar: dbSar(row.amountSar),
        blockedReason: row.blockedReason,
      }));
    }),
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · Helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The approved artifact, re-validated. An unreadable payload REFUSES; it is never partly applied. */
function parseApprovedRun(
  payload: Record<string, unknown>,
  waqfId: string,
  approvalRequestId: string,
): {
  readonly distributionId: string;
  readonly engineVersion: string;
  readonly runDigest: string;
} {
  const parsed = z
    .object({
      kind: z.literal(DISTRIBUTION_RUN_ARTIFACT_KIND),
      distributionId: z.string().min(1).max(128),
      waqfId: z.string().min(1).max(128),
      engineVersion: z.string().min(1).max(128),
      runDigest: z.string().regex(/^[0-9a-f]{64}$/, 'runDigest is 64 lowercase hex characters'),
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw runNotAuthorised(
      waqfId,
      approvalRequestId,
      `APPROVED_ARTIFACT_UNREADABLE: the stored payload does not parse as a distribution run ` +
        `(${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}). ` +
        `An artifact that cannot be read cannot be verified, and an unverifiable authority is none`,
    );
  }
  if (parsed.data.waqfId !== waqfId) {
    throw runNotAuthorised(
      waqfId,
      approvalRequestId,
      `WRONG_ENDOWMENT: the approved payload names waqf ${parsed.data.waqfId}`,
    );
  }
  return {
    distributionId: parsed.data.distributionId,
    engineVersion: parsed.data.engineVersion,
    runDigest: parsed.data.runDigest,
  };
}

/** One line item, as it is about to be written. */
interface StoredLine {
  readonly beneficiaryId: string;
  readonly status: 'PAID' | 'WITHHELD' | 'CROSS_BORDER_PENDING' | 'EXCLUDED';
  readonly sharePercent: string;
  readonly entitledSar: string;
  readonly blockedReason: string | null;
}

/**
 * The stored trace's own copy of the line set — the DISPLAY copy, not the money.
 *
 * ⚠ THIS IS NO LONGER WHAT `execute` PAYS FROM, AND THE COMMENT THAT USED TO SIT HERE WAS FALSE.
 * It said: *"The digest comparison in step 7 above is what ties the stored lines to the approved
 * artifact."* It does not. Step 7 compares the approval payload's `runDigest`/`engineVersion` to the
 * COLUMNS of the same name; `computationTrace` is a third value that comparison never touches.
 * MEASURED on a seeded cluster (AV7-E/E2/E3, V-S7 register): rewriting `{lines,0,entitledSar}` to
 * `999999.00` after a real Nazir approved the run posted paid lines of SAR 1,137,499.00 against a
 * `distributableSar` of SAR 275,000.00, with `runDigest` unchanged and the approval still verifying
 * against its own payload; flipping an `EXCLUDED` line to `PAID` was equally unchecked; and BOTH
 * writes succeeded on `qmulate_app`, the role the API process itself holds. A hash stored beside a
 * value it is never re-checked against protects nothing.
 *
 * Two changes close it, and both are here because either alone leaves a door:
 *   1. `computationTrace` is now WRITE-ONCE at the database (migration 22 §1), so the substitution
 *      is unrepresentable rather than undetected. That trigger does not cover an INSERT, though —
 *      the runtime role can still insert a fabricated run row with a hand-made trace.
 *   2. `execute` now RE-DERIVES the digest from the stored input and takes the line set from the
 *      REPLAY (`authorisedLines` below), so the money comes from bytes the approved digest covers by
 *      construction rather than from a Json sitting next to them.
 *
 * This function survives as the check that the stored copy and the replay AGREE. If they ever
 * diverge, a beneficiary's screen (which renders this Json through `apps/web`'s loader) and a
 * beneficiary's payment would disagree for ever, which is the permanent contradiction the register
 * describes — so the run refuses instead.
 *
 * ⚠ `blockedReason` CARRIES THE ENGINE'S OWN CODE, NOT PROSE. The column is free text with no
 * declared vocabulary (`schema.prisma` lists four spellings in a comment), so the value written is
 * the `reasonCode` verbatim: a machine code a `<DiagnosticCode>` can render in either locale, rather
 * than a sentence this layer would have had to invent. An EXCLUDED or WITHHELD line always has one;
 * a PAID line has none.
 */
function readStoredLines(
  trace: unknown,
  waqfId: string,
  distributionId: string,
): readonly StoredLine[] {
  const parsed = z
    .object({
      lines: z
        .array(
          z.object({
            beneficiaryId: z.string().min(1),
            status: z.enum(['PAID', 'WITHHELD', 'CROSS_BORDER_PENDING', 'EXCLUDED']),
            sharePercent: z.string().min(1),
            entitledSar: z.string().min(1),
            reasonCode: z.string().min(1).nullable(),
          }),
        )
        .min(1),
    })
    .safeParse(trace);

  if (!parsed.success) {
    throw runNotInState(
      waqfId,
      distributionId,
      `the stored computationTrace carries no readable line set ` +
        `(${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')})`,
    );
  }
  return parsed.data.lines.map((line) => ({
    beneficiaryId: line.beneficiaryId,
    status: line.status,
    sharePercent: line.sharePercent,
    entitledSar: line.entitledSar,
    blockedReason: line.reasonCode,
  }));
}

/**
 * Halalas back out of the stored input's JSON.
 *
 * ⚠ WHY A REVIVER IS NEEDED AT ALL. `serializeInput` writes every `bigint` as its base-10 STRING
 * (JSON has no bigint, and a JS number would not survive a fiduciary figure), while every monetary
 * field in `distributionInputSchema` is `nonNegativeMinorSchema` = `z.bigint()`. So handing the
 * stored Json straight back to `runDistribution` dies with `Expected bigint, received string` on the
 * first money field — measured in `test/av7-audit-trace.integration.test.ts` (ATTACK 2), which also
 * measured that the revived replay reproduces the stored digest BYTE-EXACT.
 *
 * ⚠ THE KEY SUFFIX IS NOT A GUESS. Every bigint in the input schema is reached through
 * `nonNegativeMinorSchema`, and its seven call sites are `revenue.incomeMinor`,
 * `revenue.receipts[].amountMinor`, `maintenance.amountMinor` (FIXED),
 * `maintenance.targetBalanceMinor` / `currentBalanceMinor` (RESERVE_TO_TARGET),
 * `nazirFee.fixedAmountMinor` (RETAINER), `policy.roundingUnitMinor` and `operatingCostMinor`
 * (`packages/domain/src/distribution/contract.ts`, enumerated 2026-08-19). All seven end in
 * `Minor`; nothing else in the schema is numeric. A non-numeric string under such a key throws here,
 * which the caller turns into a refusal — the fail-closed direction.
 */
function reviveStoredInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveStoredInput);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] =
        key.endsWith('Minor') && typeof item === 'string' ? BigInt(item) : reviveStoredInput(item);
    }
    return out;
  }
  return value;
}

/**
 * THE LINE SET `execute` PAYS FROM — re-derived from the stored input, tied to the approved digest,
 * and checked against the run's own `distributableSar` before a halala is written.
 *
 * ⚠ THIS IS NOT "RECOMPUTING FROM THE REGISTER", AND THE DISTINCTION IS THE WHOLE ARGUMENT. The
 * comment this replaces was right to refuse a recomputation: re-reading the ledger at execute time
 * would produce a SECOND answer, from a register that may have moved since the Nazir signed, and the
 * approval would then authorise figures nobody saw. What happens here is a REPLAY OF THE STORED
 * INPUT — the same `DistributionInputRaw` the digest was computed over, persisted verbatim by
 * `storedTrace`, with no ledger read at all. The engine is pure and its determinism is pinned by
 * `packages/domain`'s own suite (`I8 · the whole RUN is byte-identical under reversal`), so the
 * replay either reproduces the approved digest exactly or the stored run is not the approved one.
 *
 * FOUR REFUSALS, each with its own discriminator, because "the run refused" is not evidence:
 *   · `STORED_RUN_UNREPLAYABLE`              — no readable input, or the replay itself threw.
 *   · `STORED_RUN_DIGEST_NOT_REPRODUCIBLE`   — the replay's digest ≠ the run's `runDigest`, which
 *                                              step 7 has already proven equal to the approved
 *                                              payload's. So this says: the stored artifact is not
 *                                              the artifact the Nazir signed.
 *   · `STORED_LINES_DISAGREE_WITH_REPLAY`    — the trace's own line copy differs from the replay.
 *   · `LINE_TOTAL_IS_NOT_THE_DISTRIBUTABLE`  — the engine's invariant I2 (`Σ lines.entitledMinor +
 *                                              retainedMinor == distributableMinor`) does not hold
 *                                              against the PERSISTED `distributableSar` column.
 *
 * ⚠ THE LAST ONE IS THE BELT, AND IT IS NOT REDUNDANT. `distributableSar` is a column no guard
 * seals, so it can be moved without touching the trace; the digest comparison cannot see it, because
 * a `Decimal` column is not inside `canonicalizeResult`'s bytes. Nothing before this asserted that
 * the money about to be written adds up to the pool the run says it has — the register's exact words
 * were *"nothing asserts Σ lines == `distributableSar`"*. `retainedMinor` is in the identity because
 * `Σ lines == distributable` is FALSE by design when the distributable is attached to no line (an
 * empty entitled cohort retains the pool — the engine's own SPEC CORRECTION to §08 I3), and a belt
 * that fires on a correct run is worse than none.
 */
function authorisedLines(
  run: {
    readonly id: string;
    readonly runDigest: string | null;
    readonly distributableSar: { readonly toString: () => string };
    readonly computationTrace: unknown;
  },
  waqfId: string,
  approvalRequestId: string,
): readonly StoredLine[] {
  const storedCopy = readStoredLines(run.computationTrace, waqfId, run.id);

  const input = z
    .object({ input: z.record(z.string(), z.unknown()) })
    .safeParse(run.computationTrace);
  if (!input.success) {
    throw runNotAuthorised(
      waqfId,
      approvalRequestId,
      `STORED_RUN_UNREPLAYABLE: the stored computationTrace carries no \`input\` object, so the ` +
        `approved digest cannot be re-derived and the line set cannot be tied to it. A run whose ` +
        `input was not persisted verbatim is unverifiable, and an unverifiable authority is none`,
    );
  }

  let replayed: DistributionResult;
  try {
    replayed = runDistribution(reviveStoredInput(input.data.input) as DistributionInputRaw);
  } catch (error) {
    throw runNotAuthorised(
      waqfId,
      approvalRequestId,
      `STORED_RUN_UNREPLAYABLE: replaying the stored input refused or threw ` +
        `(${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'}). The stored ` +
        `input is the only thing the digest is a function of, so a run that cannot be replayed ` +
        `cannot be shown to be the run that was approved`,
    );
  }

  const replayedDigest = runDigestOf(replayed);
  if (replayedDigest !== run.runDigest) {
    throw runNotAuthorised(
      waqfId,
      approvalRequestId,
      `STORED_RUN_DIGEST_NOT_REPRODUCIBLE: replaying the run's own stored input yields ` +
        `${replayedDigest}, and the run carries ${String(run.runDigest)} — which step 7 has already ` +
        `proven equal to the digest the Nazir approved. So the stored artifact is not the artifact ` +
        `that was signed. The engine is deterministic (I8), so this is a substitution, not drift`,
    );
  }

  const lines: readonly StoredLine[] = replayed.lines.map((line) => ({
    beneficiaryId: line.beneficiaryId,
    status: line.status,
    sharePercent: line.sharePercent,
    entitledSar: sar(line.entitledMinor as bigint),
    blockedReason: line.reasonCode,
  }));

  // The stored display copy must be the same set, or a screen and a payment disagree for ever.
  const asKey = (set: readonly StoredLine[]): string =>
    JSON.stringify(
      set.map((line) => [line.beneficiaryId, line.status, line.entitledSar, line.sharePercent]),
    );
  if (asKey(storedCopy) !== asKey(lines)) {
    throw runNotAuthorised(
      waqfId,
      approvalRequestId,
      `STORED_LINES_DISAGREE_WITH_REPLAY: the trace's stored line copy is ${asKey(storedCopy)} and ` +
        `the replay of the same run's input yields ${asKey(lines)}. Both are written by \`create\` ` +
        `from ONE engine result, so a divergence means one of them was substituted — and the stored ` +
        `copy is what a beneficiary's statement renders while the replay is what would be paid`,
    );
  }

  // ── I2, ASSERTED IN INTEGER HALALAS AGAINST THE PERSISTED POOL ─────────────────────────────
  // Summed as `bigint`, compared as the canonical 2-dp strings both sides of the wire already use.
  // No float touches this, and `.toFixed(` is banned package-wide for exactly that reason.
  const lineTotalMinor = replayed.lines.reduce(
    (total, line) => total + (line.entitledMinor as bigint),
    0n,
  );
  const retainedMinor = replayed.totals.retainedMinor as bigint;
  const accounted = sar(lineTotalMinor + retainedMinor);
  const persisted = dbSar(run.distributableSar);
  if (accounted !== persisted) {
    throw runNotAuthorised(
      waqfId,
      approvalRequestId,
      `LINE_TOTAL_IS_NOT_THE_DISTRIBUTABLE: the lines about to be written total ` +
        `${sar(lineTotalMinor)} SAR with ${sar(retainedMinor)} retained — ${accounted} in all — ` +
        `against a persisted distributableSar of ${persisted}. Invariant I2 says ` +
        `Σ lines + retained == distributable, so one of the two has moved. Nothing is written`,
    );
  }

  return lines;
}

/**
 * The narrow shape of the request's Prisma client this module uses.
 *
 * Declared structurally rather than imported as `ExtendedPrismaClient` so the pure mapper's row types
 * stay the contract: a Prisma model whose columns drift becomes a compile error at the `as` boundary
 * in `assembleRun`, which is where the mapping's assumption lives.
 */
type ExtendedDb = {
  waqf: { findFirst: (args: unknown) => Promise<unknown> };
  beneficiary: { findMany: (args: unknown) => Promise<unknown> };
  waqfReversionTaker: {
    findMany: (args: unknown) => Promise<readonly { readonly beneficiaryId: string }[]>;
  };
  transaction: { findMany: (args: unknown) => Promise<unknown> };
  holidayCalendar: { findMany: (args: unknown) => Promise<readonly HolidayRow[]> };
};
