import { kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

import { invariantsNotAsserted, LIVE_RUN_STATUSES } from './labels';

import type {
  ApprovalView,
  CallerFacts,
  ComputedRunView,
  CorpusReceiptView,
  DashboardCounts,
  DualDate,
  EndowmentRef,
  LineItemRow,
  LineView,
  Loaded,
  MappingDiagnosticView,
  QueueRow,
  RunListRow,
  RunPeriod,
  RunPreview,
  StoredRunView,
  StoredTraceView,
  TimingView,
  TotalsView,
  TraceEntryView,
} from './types';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE PLACE THE DISTRIBUTION SCREENS TOUCH THE KERNEL
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The same contract `lib/endowments/loaders.ts` established, for the same reasons: every function here
 * calls a tRPC procedure through the IN-PROCESS server caller — the same router, the same composed
 * middleware chain, the same per-request scoped Prisma client the HTTP boundary uses — and maps the
 * result into `./types`. Nothing under `src/components/distributions/**` or the route files imports
 * `@qmulate/api` at all, so a projection change reddens THIS FILE at the exact line that knows about
 * both sides. There is no `as unknown as` anywhere on the path; the mapping is an assignment into a
 * narrower type, which is the whole drift detector.
 *
 * ⚠ SERVER-ONLY, ENFORCED STRUCTURALLY. `getServerCaller` reaches for `next/headers`, which throws if
 * this module is ever pulled into a client component.
 *
 * ⚠ ONE CALLER PER CALL, NEVER MEMOISED. The context bakes the caller's ACTIVE grants into the Prisma
 * client, so a module-scope caller would hand one user another user's visibility.
 *
 * ── WHAT THIS FILE DROPS, ON PURPOSE ─────────────────────────────────────────────────────────
 * Five values cross the wire and reach no screen, and this is the boundary where each stops:
 *
 *  1. `line.basis.line` (`ZUHUR` | `BUTUN`) and 2. `line.basis.lineageLink` (`SON` | `DAUGHTER`) — the
 *     ẓuhūr/buṭūn descent fact the eligibility test reads for ONE computation. Not demographics, never a
 *     person's attribute (ADR-0009). A label «بطون» beside a name discloses descent through a daughter.
 *     The i18n suite enforces the ABSENCE of a catalogue group for either, so there is no key to render
 *     them with even by accident — dropping them here means no component can reach them at all.
 *  3. `line.basis.parentId` and `line.basis.lineageDepth` — the family graph's edges. The basis a
 *     statement must show is the RULE and the TIER; the edge that produced them is audit material.
 *  4. `computationTrace[].data` — free-form structured developer context.
 *  5. the refusal's `details` — likewise. V-E3-M4 shipped a 464-character English developer paragraph
 *     into a slot announced in Arabic as "رمز تشخيصي"; the boundary that stops that is a mapping which
 *     never carries it, not a component that remembers not to print it.
 *
 * The mapping diagnostics' `detail` is also dropped, and `tsc` is what proved that must happen rather than
 * a comment: the wire type is `Readonly<Record<string, string>>`, so the version of the view model that
 * carried it as a `string` did not compile. It is the mapper's own developer context — row ids, column
 * names, spec paragraph references — and it belongs in the operator log.
 */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Normalisation helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A legally significant date is a PAIR: the canonical UTC value plus the Umm al-Qura snapshot frozen at
 * insert time (NFR-02). The snapshot is passed through untouched and NEVER recomputed.
 *
 * The canonical side is normalised to an ISO string because the two transports disagree — the in-process
 * caller hands back a `Date`, the HTTP boundary a string (no transformer, by design: money crosses that
 * wire as a decimal string and a reviver would put a float in the ledger path).
 */
function toDual(value: Date | string | null | undefined, hijri: string | null): DualDate | null {
  if (value === null || value === undefined) return null;
  const iso = value instanceof Date ? value.toISOString() : value;
  if (iso === '') return null;
  return { iso, hijri };
}

/**
 * Wraps a loader body so a kernel refusal becomes a rendered sentence rather than an error page.
 *
 * ⚠ IT CATCHES EVERYTHING, DELIBERATELY. An unexpected fault lands on `errors.generic`, which is the
 * fail-closed direction: the screen shows nothing about the run. It does mean a build gap and an access
 * refusal read the same to the user; the machine code belongs in the audit trail, which `@qmulate/api`
 * writes server-side, never on a screen.
 */
async function attempt<T>(read: () => Promise<T>, locale: string): Promise<Loaded<T>> {
  try {
    return { status: 'ok', value: await read() };
  } catch (error) {
    return { status: 'refused', messageKey: kernelMessageKey(error, locale) };
  }
}

/* ── Defensive readers for the untyped stored Json ─────────────────────────────────────────── */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function readNumber(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStrings(source: Record<string, unknown> | null, key: string): readonly string[] {
  const value = source?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readRecords(
  source: Record<string, unknown> | null,
  key: string,
): readonly Record<string, unknown>[] {
  const value = source?.[key];
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is Record<string, unknown> => item !== null);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The caller's own facts
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `whoami`, narrowed to the userId plus the permission set per endowment.
 *
 * ⚠ NOT AN AUTHORIZATION BOUNDARY. The kernel refuses every verb on its own, on every call. This is read
 * so a screen does not offer a control that is certain to be refused, and so the maker of a run can be
 * shown WHY they may not approve it instead of a button that fails.
 *
 * The permissions of MULTIPLE grants on one endowment are UNIONED, which is the shape a maker-who-is-
 * also-the-Nazir has (`FINANCE` + `NAZIR` on one waqf). The union is right for "may the UI offer this",
 * and it is precisely why the maker≠checker test below is on the IDENTITY and not on the permission: that
 * caller holds `approval:request:approve` and must still be refused.
 */
export async function loadCaller(locale: string): Promise<Loaded<CallerFacts>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const me = await caller.whoami();

    const merged = new Map<string, string[]>();
    for (const grant of me.grants) {
      const existing = merged.get(grant.waqfId);
      if (existing === undefined) merged.set(grant.waqfId, [...grant.permissions]);
      else
        for (const permission of grant.permissions)
          if (!existing.includes(permission)) existing.push(permission);
    }

    const value: CallerFacts = {
      userId: me.userId,
      permissionsByWaqf: new Map<string, readonly string[]>(merged),
    };
    return value;
  }, locale);
}

/** Does the caller's grant on this endowment resolve to this permission? A courtesy, never the gate. */
export function holds(caller: CallerFacts | null, waqfId: string, permission: string): boolean {
  return caller?.permissionsByWaqf.get(waqfId)?.includes(permission) ?? false;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The endowments in scope
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Every endowment in the caller's scope — FROM `whoami`'s GRANTS, labelled from `navigation.tree`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ WHY NOT THE TREE ALONE. MEASURED, NOT ASSUMED.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Against the seeded database, on a production build, through `/api/trpc` with a real session:
 *
 *   · `user-accountant-001` (`FINANCE`) · `whoami` → FIVE ACTIVE grants, each holding
 *     `distribution:run:read` and `distribution:run:initiate` · `navigation.tree` → `{"clients":[]}`
 *   · `user-nazir-001` (`NAZIR`) · the same `navigation.tree` → the whole hierarchy, 5 endowments
 *
 * The pre-existing `/en/endowments` index renders "No endowment is within your access scope" for the
 * finance seat, so this is a property of the kernel's force filter and not of this module. But the
 * consequence for THIS module would have been severe: the distribution index, the approvals queue and
 * both dashboard tiles would be permanently EMPTY for the only role that may create or submit a run,
 * and every one of them would have looked like a working screen with nothing to show.
 *
 * So the SET comes from the caller's own grants — authoritative, needs no further permission, and a
 * grant is precisely what "in scope" means — and the tree supplies only the LABELS. A seat that cannot
 * read the tree still sees its endowments, identified by `waqfId`.
 *
 * ⚠ A REFUSED OR EMPTY TREE IS NOT AN ERROR HERE. It costs the certificate number and the
 * classification, which are then `null` and rendered as such. Nothing is fabricated: `classification`
 * gates real regulatory obligations, and inventing one would be inventing a compliance fact.
 */
export async function loadEndowmentRefs(locale: string): Promise<Loaded<readonly EndowmentRef[]>> {
  const caller = await loadCaller(locale);
  if (caller.status !== 'ok') return caller;

  const labels = new Map<
    string,
    {
      certificateNumber: string | null;
      classification: string | null;
      entitlementOrder: string | null;
    }
  >();

  // Best-effort, and its refusal is swallowed on purpose: a missing label must not remove an endowment
  // the caller demonstrably holds a grant on.
  const tree = await attempt(async () => {
    const client = await getServerCaller(locale);
    return client.navigation.tree();
  }, locale);

  if (tree.status === 'ok') {
    for (const client of tree.value.clients) {
      for (const waqif of client.waqifs) {
        for (const waqf of waqif.waqfs) {
          labels.set(waqf.id, {
            certificateNumber: waqf.certificateNumber,
            classification: waqf.classification,
            entitlementOrder: waqf.entitlementOrder,
          });
        }
      }
    }
  }

  // Sorted by id so the list is stable across renders; `whoami` may report two grants on one endowment
  // (the maker-who-is-also-the-Nazir shape), and an endowment appears once.
  const waqfIds = [...caller.value.permissionsByWaqf.keys()].sort();
  const refs: EndowmentRef[] = waqfIds.map((waqfId) => {
    const label = labels.get(waqfId);
    return {
      waqfId,
      certificateNumber: label?.certificateNumber ?? null,
      classification: label?.classification ?? null,
      entitlementOrder: label?.entitlementOrder ?? null,
    };
  });

  return { status: 'ok', value: refs as readonly EndowmentRef[] };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The run list
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export async function loadRunList(
  locale: string,
  waqfId: string,
): Promise<Loaded<readonly RunListRow[]>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const rows = await caller.distribution.list({ waqfId, limit: 50 });
    return rows.map((row): RunListRow => ({
      distributionId: row.distributionId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status,
      distributableSar: row.distributableSar,
      approvalRequestId: row.approvalRequestId,
      engineVersion: row.engineVersion,
      runDigest: row.runDigest,
    })) as readonly RunListRow[];
  }, locale);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · The preview — the only read that computes
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Compute a period and return either the run or the refusal. **Writes nothing.**
 *
 * ⚠ THE REFUSAL IS DATA, NOT AN EXCEPTION, AND THAT IS THE WHOLE REASON `preview` IS SHAPED THIS WAY.
 * tRPC's `errorFormatter` threads only `cause.code` and `cause.messageKey`, so a thrown
 * `SHART_INCOMPLETE` reaches a screen with no discriminator — and the discriminator is the only thing
 * that tells the twenty-six halts apart. Widening the formatter would touch every code in the product;
 * returning `{status:'refused', …}` as data does not. The message string is NEVER parsed: whether it
 * happens to contain the discriminator is a per-call-site accident.
 *
 * An `ApiError` — a permission or configuration refusal — still throws, and lands on `attempt`'s
 * refusal. That is correct: it is not a statement about the founder's conditions and must not be
 * rendered as one.
 */
export async function previewRun(
  locale: string,
  waqfId: string,
  period: RunPeriod,
): Promise<Loaded<RunPreview>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const result = await caller.distribution.preview({
      waqfId,
      periodStart: period.start,
      periodEnd: period.end,
    });

    if (result.status === 'refused') {
      const value: RunPreview = {
        status: 'refused',
        refusal: {
          period: { start: result.period.start, end: result.period.end },
          code: result.code,
          refusal: result.refusal,
          refusalSource: result.refusalSource,
          // ⚠ VALIDATED, NOT TRUSTED. `kernelMessageKey` reads `messageKey` off the object, checks it
          // against both error namespaces and degrades to `errors.generic` — so a renamed code cannot
          // print `errors.domain.WHATEVER` on a Nazir's screen. The wire value is nullable; a `null`
          // becomes the generic sentence rather than a blank.
          messageKey: kernelMessageKey({ messageKey: result.messageKey }, locale),
        },
      };
      return value;
    }

    return { status: 'computed', run: toComputedRun(result.run) } satisfies RunPreview;
  }, locale);
}

/** `projectRun`'s output → the view model. Every drop named in the file header happens here. */
function toComputedRun(run: {
  readonly engineVersion: string;
  readonly runDigest: string;
  readonly waqfId: string;
  readonly distributionType: string;
  readonly classification: string;
  readonly waqfType: string;
  readonly entitlementOrder: string;
  readonly entitlementRule: string;
  readonly period: { readonly start: string; readonly end: string };
  readonly waterfall: {
    readonly revenueSar: string;
    readonly capitalReceiptsSar: string;
    readonly maintenanceReserveSar: string;
    readonly operatingSar: string;
    readonly netIncomeSar: string;
    readonly nazirFeeSar: string;
    readonly nazirFeeBasis: string | null;
    readonly distributableSar: string;
  };
  readonly excludedCapitalReceipts: readonly {
    readonly transactionId: string;
    readonly receiptClass: string;
    readonly capitalSource: string | null;
    readonly amountSar: string;
  }[];
  readonly totals: {
    readonly paidSar: string;
    readonly withheldSar: string;
    readonly crossBorderSar: string;
    readonly retainedSar: string;
    readonly entitledSar: string;
    readonly excludedCount: number;
    readonly entitledLineCount: number;
    readonly residualSar: string;
  };
  readonly lines: readonly {
    readonly beneficiaryId: string;
    readonly status: string;
    readonly entitledSar: string;
    readonly sharePercent: string;
    readonly basis: {
      readonly tabaqa: number | null;
      readonly branch: string | null;
      readonly kind: string;
      readonly rule: string;
      readonly continuationStipulation: string | null;
    };
    readonly reasonCode: string | null;
    readonly gateFlags: readonly string[];
  }[];
  readonly timing: {
    readonly status: string;
    readonly basis: string;
    readonly bindingCalendar: string;
    readonly boundBy: string;
    readonly deadlineGregorian: string;
    readonly deadlineHijri: string;
    readonly bindingDeadlineGregorian: string;
    readonly daysUntilDeadline: number;
    readonly months: number;
    readonly asOf: { readonly gregorian: string; readonly hijri: string };
    readonly unverifiedNote: string | null;
  };
  readonly authorityNotices: readonly {
    readonly type: string;
    readonly beneficiaryId: string;
    readonly reasonCode: string;
  }[];
  readonly flags: readonly string[];
  readonly invariantsChecked: readonly string[];
  readonly unverifiedNotes: readonly string[];
  readonly computationTrace: readonly {
    readonly seq: number;
    readonly stage: string;
    readonly code: string;
  }[];
  readonly diagnostics: readonly { readonly code: string; readonly severity: string }[];
}): ComputedRunView {
  return {
    engineVersion: run.engineVersion,
    runDigest: run.runDigest,
    waqfId: run.waqfId,
    distributionType: run.distributionType,
    classification: run.classification,
    waqfType: run.waqfType,
    entitlementOrder: run.entitlementOrder,
    entitlementRule: run.entitlementRule,
    period: { start: run.period.start, end: run.period.end },
    waterfall: {
      revenueSar: run.waterfall.revenueSar,
      capitalReceiptsSar: run.waterfall.capitalReceiptsSar,
      maintenanceReserveSar: run.waterfall.maintenanceReserveSar,
      operatingSar: run.waterfall.operatingSar,
      netIncomeSar: run.waterfall.netIncomeSar,
      nazirFeeSar: run.waterfall.nazirFeeSar,
      nazirFeeBasis: run.waterfall.nazirFeeBasis,
      distributableSar: run.waterfall.distributableSar,
    },
    excludedCapitalReceipts: run.excludedCapitalReceipts.map((receipt): CorpusReceiptView => ({
      transactionId: receipt.transactionId,
      receiptClass: receipt.receiptClass,
      capitalSource: receipt.capitalSource,
      amountSar: receipt.amountSar,
    })),
    totals: { ...run.totals },
    lines: run.lines.map((line): LineView => ({
      beneficiaryId: line.beneficiaryId,
      status: line.status,
      entitledSar: line.entitledSar,
      sharePercent: line.sharePercent,
      reasonCode: line.reasonCode,
      gateFlags: [...line.gateFlags],
      // ⚠ FIVE FIELDS OF `LineBasis`, AND FIVE ONLY. `line`, `lineageLink`, `parentId` and
      // `lineageDepth` are not assigned anywhere — see the file header.
      basis: {
        tabaqa: line.basis.tabaqa,
        branch: line.basis.branch,
        kind: line.basis.kind,
        rule: line.basis.rule,
        continuationStipulation: line.basis.continuationStipulation,
      },
    })),
    timing: toTiming(run.timing),
    authorityNotices: run.authorityNotices.map((notice) => ({
      type: notice.type,
      beneficiaryId: notice.beneficiaryId,
      reasonCode: notice.reasonCode,
    })),
    flags: [...run.flags],
    invariantsChecked: [...run.invariantsChecked],
    invariantsNotAsserted: invariantsNotAsserted(run.invariantsChecked),
    unverifiedNotes: [...run.unverifiedNotes],
    // ⚠ `detail` IS NOT ASSIGNED. See `MappingDiagnosticView` — it is the mapper's own developer
    // context and belongs in the operator log, not on a trustee's screen.
    diagnostics: run.diagnostics.map((diagnostic): MappingDiagnosticView => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
    })),
    // ⚠ `data` IS NOT ASSIGNED. The trace's stage and code are what a screen renders from.
    trace: run.computationTrace.map((entry): TraceEntryView => ({
      seq: entry.seq,
      stage: entry.stage,
      code: entry.code,
    })),
  };
}

function toTiming(timing: {
  readonly status: string;
  readonly basis: string;
  readonly bindingCalendar: string;
  readonly boundBy: string;
  readonly deadlineGregorian: string;
  readonly deadlineHijri: string;
  readonly bindingDeadlineGregorian: string;
  readonly daysUntilDeadline: number;
  readonly months: number;
  readonly asOf: { readonly gregorian: string; readonly hijri: string };
  readonly unverifiedNote: string | null;
}): TimingView {
  return {
    status: timing.status,
    basis: timing.basis,
    bindingCalendar: timing.bindingCalendar,
    boundBy: timing.boundBy,
    deadlineGregorian: timing.deadlineGregorian,
    deadlineHijri: timing.deadlineHijri,
    bindingDeadlineGregorian: timing.bindingDeadlineGregorian,
    daysUntilDeadline: timing.daysUntilDeadline,
    months: timing.months,
    asOf: { iso: timing.asOf.gregorian, hijri: timing.asOf.hijri },
    unverified: timing.unverifiedNote !== null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · A stored run
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** One persisted run. `null` — not a refusal — when it is not visible: absence reads as NOT FOUND. */
export async function loadStoredRun(
  locale: string,
  waqfId: string,
  distributionId: string,
): Promise<Loaded<StoredRunView | null>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const row = await caller.distribution.get({ waqfId, distributionId });
    if (row === null) return null;

    const periodStart = toDual(row.periodStart, row.periodStartHijri);
    const periodEnd = toDual(row.periodEnd, row.periodEndHijri);
    if (periodStart === null || periodEnd === null) {
      // A run whose period cannot be read is not a run this screen may present. It is refused rather
      // than rendered with a blank window: a fiscal period is what every figure below it is about.
      throw new Error(`distribution ${distributionId} carries no readable period`);
    }

    const value: StoredRunView = {
      distributionId: row.distributionId,
      waqfId: row.waqfId,
      status: row.status,
      periodStart,
      periodEnd,
      grossRevenueSar: row.grossRevenueSar,
      reserveSar: row.reserveSar,
      operatingSar: row.operatingSar,
      nazirFeeSar: row.nazirFeeSar,
      distributableSar: row.distributableSar,
      approvalRequestId: row.approvalRequestId,
      executedAt: toDual(row.executedAt, row.executedAtHijri),
      engineVersion: row.engineVersion,
      runDigest: row.runDigest,
      trace: readStoredTrace(row.computationTrace),
    };
    return value;
  }, locale);
}

/**
 * The stored `computationTrace` Json → what a screen may render, or `null`.
 *
 * ⚠ DEFENSIVE ALL THE WAY DOWN, BECAUSE THE COLUMN IS UNTYPED AND HOLDS HISTORY. `dist-001` is seeded
 * as a HISTORICAL record whose own numbers are internally inconsistent — deliberately, with the
 * discrepancy recorded in this very column rather than repaired — and it carries no `engineVersion` at
 * all. Every field is therefore read by shape and reported as absent when it is not there. The screen
 * states the absence; it never fills it in.
 */
function readStoredTrace(raw: unknown): StoredTraceView | null {
  const trace = asRecord(raw);
  if (trace === null) return null;

  const timingRecord = asRecord(trace['timing']);
  const asOf = asRecord(timingRecord?.['asOf']);
  const asOfGregorian = readString(asOf, 'gregorian');
  const asOfHijri = readString(asOf, 'hijri');

  const timingStatus = readString(timingRecord, 'status');
  const timing: TimingView | null =
    timingRecord === null || timingStatus === null || asOfGregorian === null
      ? null
      : {
          status: timingStatus,
          basis: readString(timingRecord, 'basis') ?? '',
          bindingCalendar: readString(timingRecord, 'bindingCalendar') ?? '',
          boundBy: readString(timingRecord, 'boundBy') ?? '',
          deadlineGregorian: readString(timingRecord, 'deadlineGregorian') ?? '',
          deadlineHijri: readString(timingRecord, 'deadlineHijri') ?? '',
          bindingDeadlineGregorian: readString(timingRecord, 'bindingDeadlineGregorian') ?? '',
          daysUntilDeadline: readNumber(timingRecord, 'daysUntilDeadline') ?? 0,
          months: readNumber(timingRecord, 'months') ?? 0,
          asOf: { iso: asOfGregorian, hijri: asOfHijri },
          unverified: readString(timingRecord, 'unverifiedNote') !== null,
        };

  const totalsRecord = asRecord(trace['totals']);
  const totals: TotalsView | null =
    totalsRecord === null
      ? null
      : {
          paidSar: readString(totalsRecord, 'paidSar') ?? '0.00',
          withheldSar: readString(totalsRecord, 'withheldSar') ?? '0.00',
          crossBorderSar: readString(totalsRecord, 'crossBorderSar') ?? '0.00',
          retainedSar: readString(totalsRecord, 'retainedSar') ?? '0.00',
          entitledSar: readString(totalsRecord, 'entitledSar') ?? '0.00',
          residualSar: readString(totalsRecord, 'residualSar') ?? '0.00',
          excludedCount: readNumber(totalsRecord, 'excludedCount') ?? 0,
          entitledLineCount: readNumber(totalsRecord, 'entitledLineCount') ?? 0,
        };

  const lines: LineView[] = [];
  for (const line of readRecords(trace, 'lines')) {
    const beneficiaryId = readString(line, 'beneficiaryId');
    const status = readString(line, 'status');
    if (beneficiaryId === null || status === null) continue;
    const basis = asRecord(line['basis']);
    lines.push({
      beneficiaryId,
      status,
      entitledSar: readString(line, 'entitledSar') ?? '0.00',
      sharePercent: readString(line, 'sharePercent') ?? '0.000000',
      reasonCode: readString(line, 'reasonCode'),
      gateFlags: readStrings(line, 'gateFlags'),
      // ⚠ THE SAME FIVE FIELDS, AND THE SAME FOUR OMISSIONS, as the computed path.
      basis: {
        tabaqa: readNumber(basis, 'tabaqa'),
        branch: readString(basis, 'branch'),
        kind: readString(basis, 'kind') ?? '',
        rule: readString(basis, 'rule') ?? '',
        continuationStipulation: readString(basis, 'continuationStipulation'),
      },
    });
  }

  /**
   * ⚠ THE CORPUS RECEIPTS ARE RECOVERED FROM THE STORED INPUT, BY ID, AND WITHOUT THEIR AMOUNT.
   *
   * `distribution.get` projects no `excludedCapitalReceipts` — the preview and create paths report them
   * with a SAR amount, a re-read of a stored run does not. The stored input holds the amount as an exact
   * base-10 HALALA integer string, and converting it to SAR here would be money arithmetic in this app,
   * which risk #9 forbids outright (`packages/api` owns every halala→decimal conversion). So the ids,
   * the class and the source are shown and the amount is stated as not projected.
   *
   * Showing the ids matters even without the figure: it is the difference between "corpus was held out"
   * and "corpus was held out, and here is exactly which receipt".
   */
  const corpusReceipts: CorpusReceiptView[] = [];
  const input = asRecord(trace['input']);
  for (const receipt of readRecords(asRecord(input?.['revenue']), 'receipts')) {
    const id = readString(receipt, 'id');
    const receiptClass = readString(receipt, 'receiptClass');
    if (id === null || receiptClass === null || receiptClass === 'INCOME') continue;
    corpusReceipts.push({
      transactionId: id,
      receiptClass,
      capitalSource: readString(receipt, 'capitalSource'),
      amountSar: null,
    });
  }

  const invariantsChecked = readStrings(trace, 'invariantsChecked');

  return {
    engineVersion: readString(trace, 'engineVersion'),
    runDigest: readString(trace, 'runDigest'),
    distributionType: readString(trace, 'distributionType'),
    entitlementOrder: readString(trace, 'entitlementOrder'),
    entitlementRule: readString(trace, 'entitlementRule'),
    flags: readStrings(trace, 'flags'),
    invariantsChecked,
    invariantsNotAsserted: invariantsNotAsserted(invariantsChecked),
    unverifiedNotes: readStrings(trace, 'unverifiedNotes'),
    timing,
    totals,
    lines,
    corpusReceipts,
    diagnostics: readRecords(trace, 'mappingDiagnostics').flatMap((diagnostic) => {
      const code = readString(diagnostic, 'code');
      if (code === null) return [];
      // ⚠ `detail` IS NOT READ, for the same reason. In the stored Json it is an OBJECT, so a reader
      // that expected a string would have silently produced an empty one and looked like it worked.
      return [
        {
          code,
          severity: readString(diagnostic, 'severity') ?? '',
        } satisfies MappingDiagnosticView,
      ];
    }),
    trace: readRecords(trace, 'trace').flatMap((entry) => {
      const code = readString(entry, 'code');
      const stage = readString(entry, 'stage');
      const seq = readNumber(entry, 'seq');
      if (code === null || stage === null || seq === null) return [];
      // ⚠ `message` AND `data` ARE NOT READ. `message` is frozen copy inside the digest.
      return [{ seq, stage, code } satisfies TraceEntryView];
    }),
  };
}

/** The PERSISTED line items — the record after `execute`. Empty before it. */
export async function loadLineItems(
  locale: string,
  waqfId: string,
  distributionId: string,
): Promise<Loaded<readonly LineItemRow[]>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const rows = await caller.distribution.lines({ waqfId, distributionId });
    return rows.map((row): LineItemRow => ({
      lineItemId: row.lineItemId,
      beneficiaryId: row.beneficiaryId,
      status: row.status,
      sharePercent: row.sharePercent,
      amountSar: row.amountSar,
      blockedReason: row.blockedReason,
    })) as readonly LineItemRow[];
  }, locale);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7 · The approval
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export async function loadApproval(
  locale: string,
  waqfId: string,
  approvalRequestId: string,
): Promise<Loaded<ApprovalView | null>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const row = await caller.approval.get({ waqfId, approvalRequestId });
    if (row === null) return null;
    const value: ApprovalView = {
      approvalRequestId: row.id,
      type: row.type,
      status: row.status,
      makerId: row.makerId,
      checkerId: row.checkerId,
      subjectId: row.subjectId,
      payloadHash: row.payloadHash,
    };
    return value;
  }, locale);
}

/**
 * The Nazir's queue: every LIVE run across every endowment in scope, with its approval.
 *
 * ⚠ IT IS COMPOSED, BECAUSE THERE IS NO `approval.list` PROCEDURE. The kernel exposes
 * `approval.get({approvalRequestId})` and nothing that enumerates open requests, so the queue is built
 * from `distribution.list` per endowment and one `approval.get` per run that names one. Two consequences
 * are stated rather than hidden: this queue covers DISTRIBUTION RUNS only — a pending `RESERVED_MATTER`
 * or `BANK_MOVEMENT` does not appear in it — and it costs one call per endowment plus one per live run.
 * A real queue wants an endowment-scoped `approval.list`; that is owed to the API layer, not inventable
 * here.
 *
 * ⚠ A REFUSAL ON ONE ENDOWMENT DOES NOT BLANK THE QUEUE. A caller may hold `distribution:run:read` on
 * some endowments and not others; the ones it may read are listed and the ones it may not contribute
 * nothing — which is the same non-disclosure rule every endowment-scoped read follows. It does mean an
 * empty queue and a fully-refused queue look alike; the counts on the page state how many endowments
 * answered.
 */
export async function loadApprovalQueue(locale: string): Promise<Loaded<readonly QueueRow[]>> {
  const refs = await loadEndowmentRefs(locale);
  if (refs.status !== 'ok') return refs;

  const queue: QueueRow[] = [];
  for (const ref of refs.value) {
    const runs = await loadRunList(locale, ref.waqfId);
    if (runs.status !== 'ok') continue;

    for (const run of runs.value) {
      if (!LIVE_RUN_STATUSES.includes(run.status)) continue;
      const approval =
        run.approvalRequestId === null
          ? null
          : await loadApproval(locale, ref.waqfId, run.approvalRequestId);
      queue.push({
        waqfId: ref.waqfId,
        certificateNumber: ref.certificateNumber,
        run,
        approval: approval !== null && approval.status === 'ok' ? approval.value : null,
      });
    }
  }
  return { status: 'ok', value: queue as readonly QueueRow[] };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 8 · The dashboard's two live counts
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Two counts, read from the record, with the numbers that stop a zero from lying.
 *
 * `pendingApproval` is exact: it is a status. `overdue` counts runs whose OWN stored `timing.status` is
 * `OVERDUE`, because the deadline lives in `@qmulate/domain`'s Umm al-Qura and business-day code, which
 * this app cannot import — and a second deadline implementation here would be a second answer to "is
 * this late". A run written before that trace shape existed records no timing; those are counted
 * separately so a zero reads as "none could be assessed" rather than "none are late".
 *
 * ⚠ THE WINDOW BEHIND `OVERDUE` IS UNVERIFIED AGAINST PRIMARY LAW (the 3-month post-fiscal-year-end
 * default, and `EARLIER_OF` as the binding rule). The tile carries the marker.
 */
export async function loadDashboardCounts(locale: string): Promise<Loaded<DashboardCounts>> {
  const refs = await loadEndowmentRefs(locale);
  if (refs.status !== 'ok') return refs;

  let pendingApproval = 0;
  let overdue = 0;
  let runsInspected = 0;
  let runsWithoutRecordedTiming = 0;
  let endowmentsRead = 0;

  for (const ref of refs.value) {
    const runs = await loadRunList(locale, ref.waqfId);
    if (runs.status !== 'ok') continue;
    endowmentsRead += 1;

    for (const run of runs.value) {
      if (run.status === 'PENDING_APPROVAL') pendingApproval += 1;
      if (!LIVE_RUN_STATUSES.includes(run.status)) continue;

      runsInspected += 1;
      const stored = await loadStoredRun(locale, ref.waqfId, run.distributionId);
      const timing = stored.status === 'ok' ? (stored.value?.trace?.timing ?? null) : null;
      if (timing === null) runsWithoutRecordedTiming += 1;
      else if (timing.status === 'OVERDUE') overdue += 1;
    }
  }

  return {
    status: 'ok',
    value: { pendingApproval, overdue, endowmentsRead, runsInspected, runsWithoutRecordedTiming },
  };
}
