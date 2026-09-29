import 'server-only';

import { composeComplianceKpis, dominantTone } from '@qmulate/api';

import { loadEndowmentRefs } from '@/lib/distributions/loaders';
import { kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

import type {
  AmlKpiView,
  BoardCause,
  BoardRowState,
  ComminglingView,
  DeadlineBoardView,
  EndowmentBoard,
  FilingsView,
  KycFreshness,
  KycView,
  RollupLine,
} from './types';
import type { DualDate, Loaded } from '@/lib/endowments/types';

/**
 * ═══════════════════════════════════════════════════════
 * THE COMPLIANCE BOARD'S READS — five kernel procedures per endowment, each carried as `Loaded<>`
 * ═══════════════════════════════════════════════════════
 *
 * S11 · 2b (E10). The board is the trustee's morning screen and the first screen on which a RED means
 * "the Nazir is in breach of a zero-tolerance duty". Everything on it is therefore read through the same
 * discipline the record screens use:
 *
 *  · Every read is endowment-scoped and goes through the server caller as THIS caller — a seat that
 *    holds `compliance:task:read` on one endowment sees that endowment's board and nothing else, and the
 *    kernel's own §10 §7.2 non-disclosure decides what "nothing else" looks like (NOT_FOUND, not FORBIDDEN).
 *  · A REFUSED read is carried as `{ status: 'refused', messageKey }` and rendered as a refusal — never as
 *    a zero, an em-dash, or a green chip. The five chips have a FOURTH tone for exactly this (`refused`).
 *  · NO tone is decided here. `composeComplianceKpis` in `@qmulate/api` is the one place the five tones
 *    come from, and it is unit-tested there against every combination this app can hand it.
 *  · Dates cross as the frozen dual snapshot (Gregorian ISO + the Hijri written at insert time) and are
 *    rendered verbatim; nothing is recomputed in the browser's language.
 *
 * ⚠ Binding rule 3 — every window behind a deadline state, and the KYC refresh interval, is unverified
 * against primary law. `deadline.board` says so on the wire (`unverifiedNote`); the board renders it.
 */

/* ═════════════════════════════════════════════════
 * 0 · Two helpers this module keeps private, like its two siblings
 * ═════════════════════════════════════════════════ */

function toDual(value: Date | string | null | undefined, hijri: string | null): DualDate | null {
  if (value === null || value === undefined) return null;
  const iso = value instanceof Date ? value.toISOString() : value;
  if (iso === '') return null;
  return { iso, hijri };
}

/**
 * Wraps a loader body so a kernel refusal becomes a rendered sentence rather than an error page. It
 * catches everything, deliberately (see `lib/endowments/loaders.ts` for the whole argument): an
 * unexpected fault lands on `errors.generic`, the fail-closed direction.
 */
async function attempt<T>(read: () => Promise<T>, locale: string): Promise<Loaded<T>> {
  try {
    return { status: 'ok', value: await read() };
  } catch (error) {
    return { status: 'refused', messageKey: kernelMessageKey(error, locale) };
  }
}

/* ═════════════════════════════════════════════════
 * 1 · deadline.board
 * ═════════════════════════════════════════════════ */

export async function loadDeadlineBoard(
  locale: string,
  waqfId: string,
): Promise<Loaded<DeadlineBoardView>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const board = await caller.deadline.board({ waqfId });
    return {
      waqfId: board.waqfId,
      asOf: { iso: board.asOf.gregorian, hijri: board.asOf.hijri },
      calendar: board.calendar.available
        ? { available: true, coverage: board.calendar.coverage }
        : { available: false, refusal: board.calendar.refusal },
      settingsRefusal: board.settingsRefusal,
      rules: board.rules.map((rule) => ({
        ruleKey: rule.ruleKey,
        zeroTolerance: rule.zeroTolerance,
        cause: rule.cause as BoardCause | null,
        rows: rule.rows.map((row) => {
          const due = toDual(row.dueDate, row.dueDateHijri);
          const dischargedOn = toDual(row.satisfiedAt, row.satisfiedAtHijri);
          return {
            id: row.id,
            // A row without a due date cannot exist (the column is NOT NULL); the fallback keeps the
            // type honest without inventing a date — it renders as the recorded ISO string, unpaired.
            due: due ?? { iso: String(row.dueDate), hijri: null },
            state: row.state as BoardRowState,
            businessDaysRemaining: row.businessDaysRemaining,
            cannotCompute: row.cannotCompute,
            discharged:
              dischargedOn === null || row.dischargeKind === null
                ? null
                : { kind: row.dischargeKind, on: dischargedOn },
          };
        }),
      })),
      kpi1: board.kpi1,
      unverifiedNote: board.unverifiedNote,
    };
  }, locale);
}

/* ═════════════════════════════════════════════════
 * 2 · finance.summary → commingling only
 * ═════════════════════════════════════════════════ */

export async function loadCommingling(
  locale: string,
  waqfId: string,
): Promise<Loaded<ComminglingView>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const summary = await caller.finance.summary({ waqfId });
    return summary.commingling;
  }, locale);
}

/* ═════════════════════════════════════════════════
 * 3 · compliance.amlKpi
 * ═════════════════════════════════════════════════ */

export async function loadAmlKpi(locale: string, waqfId: string): Promise<Loaded<AmlKpiView>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const kpi = await caller.compliance.amlKpi({ waqfId });
    return { missedReports: kpi.missedReports, assessable: kpi.assessable, reason: kpi.reason };
  }, locale);
}

/* ═════════════════════════════════════════════════
 * 4 · beneficiary.list → KYC freshness
 * ═════════════════════════════════════════════════ */

export async function loadKyc(locale: string, waqfId: string): Promise<Loaded<KycView>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const beneficiaries = await caller.beneficiary.list({ waqfId });
    const counts: Record<KycFreshness, number> = { FRESH: 0, STALE: 0, UNVERIFIED: 0 };
    const rows = beneficiaries.map((row) => {
      const freshness = row.kycFreshness as KycFreshness;
      counts[freshness] += 1;
      return {
        id: row.id,
        freshness,
        lastRefreshed: toDual(row.kycLastRefreshed, row.kycLastRefreshedHijri),
      };
    });
    return { rows, counts };
  }, locale);
}

/* ═════════════════════════════════════════════════
 * 5 · filing.list
 * ═════════════════════════════════════════════════ */

export async function loadFilings(locale: string, waqfId: string): Promise<Loaded<FilingsView>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const { filings, manualStatusNote } = await caller.filing.list({ waqfId });
    return {
      manualStatusNote,
      rows: filings.map((row) => ({
        id: row.id,
        platform: row.platform,
        status: row.status,
        lastUpdated: toDual(row.lastUpdated, row.lastUpdatedHijri),
      })),
    };
  }, locale);
}

/* ═════════════════════════════════════════════════
 * 6 · The whole board for one endowment, and the roll-up over every readable one
 * ═════════════════════════════════════════════════ */

function asApiLoaded<T>(loaded: Loaded<T>) {
  return loaded.status === 'ok'
    ? ({ ok: true, value: loaded.value } as const)
    : ({ ok: false, refusal: loaded.messageKey } as const);
}

export async function loadEndowmentBoard(
  locale: string,
  waqfId: string,
  certificateNumber: string | null,
): Promise<EndowmentBoard> {
  const [deadlines, commingling, aml, kyc, filings] = await Promise.all([
    loadDeadlineBoard(locale, waqfId),
    loadCommingling(locale, waqfId),
    loadAmlKpi(locale, waqfId),
    loadKyc(locale, waqfId),
    loadFilings(locale, waqfId),
  ]);
  const kpis = composeComplianceKpis({
    deadlines: asApiLoaded(deadlines),
    commingling: asApiLoaded(commingling),
    kyc: asApiLoaded(kyc),
    aml: asApiLoaded(aml),
  });
  return {
    waqfId,
    certificateNumber,
    deadlines,
    commingling,
    aml,
    kyc,
    filings,
    kpis,
    dominant: dominantTone(kpis),
  };
}

/**
 * The roll-up: every endowment the caller holds a grant on, each with its dominant tone. The SET comes
 * from the caller's grants (`loadEndowmentRefs`); a refused board read is a `refused` line, not a
 * missing one — an endowment this seat cannot fully read must still appear, as unreadable.
 */
export async function loadRollup(
  locale: string,
): Promise<
  Loaded<{ readonly lines: readonly RollupLine[]; readonly boards: readonly EndowmentBoard[] }>
> {
  const refs = await loadEndowmentRefs(locale);
  if (refs.status !== 'ok') return refs;
  const boards: EndowmentBoard[] = [];
  for (const ref of refs.value) {
    boards.push(await loadEndowmentBoard(locale, ref.waqfId, ref.certificateNumber));
  }
  const lines = boards.map((board) => ({
    waqfId: board.waqfId,
    certificateNumber: board.certificateNumber,
    dominant: board.dominant,
    overdueRows:
      board.deadlines.status === 'ok'
        ? board.deadlines.value.rules.reduce(
            (sum, rule) => sum + rule.rows.filter((row) => row.state === 'overdue').length,
            0,
          )
        : 0,
  }));
  return { status: 'ok', value: { lines, boards } };
}
