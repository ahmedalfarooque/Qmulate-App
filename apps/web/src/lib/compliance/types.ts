/**
 * `lib/compliance/types.ts` — the compliance board's VIEW types (E10 · §14 §3). **S11 · 2b.**
 *
 * Every type here is a projection of a kernel read (`deadline.board` · `finance.summary` ·
 * `compliance.amlKpi` · `beneficiary.list` · `filing.list`) into what the board renders. Nothing is
 * decided here that the kernel did not already decide: a state is the kernel's state, a cause is the
 * kernel's cause, and the five chip tones come from ONE pure function in `@qmulate/api`
 * (`composeComplianceKpis`), unit-tested there. A refusal on any read is carried as a refusal and
 * rendered as one — the board never turns a failed request into a zero, a dash, or a green chip.
 */

import type { KpiChip, KpiTone } from '@qmulate/api';

import type { DualDate, Loaded } from '@/lib/endowments/types';

export type { KpiChip, KpiKey, KpiTone } from '@qmulate/api';

/* ═════════════════════════════════════════════════
 * 1 · deadline.board
 * ═════════════════════════════════════════════════ */

/** The kernel's row state — §09's lifecycle plus the board-only `cannot_compute`. Strings on the wire. */
export type BoardRowState =
  'pending' | 'due_soon' | 'at_risk' | 'overdue' | 'met' | 'waived' | 'cannot_compute';

/** Why a rule has no row — the kernel's six kinds of absence. */
export type BoardCause =
  | 'NOT_RECORDED'
  | 'RECORDED_NOT_COMPUTABLE'
  | 'ROUTED_NO_HOME'
  | 'NOT_COMPUTED'
  | 'NOT_IN_SCOPE_YET'
  | 'NO_SUBJECT';

export interface BoardRow {
  readonly id: string;
  readonly due: DualDate;
  readonly state: BoardRowState;
  /** Positive before due, negative after; `null` when closed or not computable. */
  readonly businessDaysRemaining: number | null;
  /** The refusal code when `state === 'cannot_compute'`. */
  readonly cannotCompute: string | null;
  /** The recorded discharge — kind + date — when the row is MET. */
  readonly discharged: { readonly kind: string; readonly on: DualDate } | null;
}

export interface BoardRule {
  readonly ruleKey: string;
  readonly zeroTolerance: boolean;
  readonly rows: readonly BoardRow[];
  /** Set only when `rows` is empty. */
  readonly cause: BoardCause | null;
}

export interface DeadlineBoardView {
  readonly waqfId: string;
  readonly asOf: DualDate;
  readonly calendar:
    | {
        readonly available: true;
        readonly coverage: { readonly from: string; readonly to: string };
      }
    | { readonly available: false; readonly refusal: string | null };
  readonly settingsRefusal: string | null;
  readonly rules: readonly BoardRule[];
  /** KPI 1 exactly as the kernel decided it (`deadline.board.kpi1`). */
  readonly kpi1: {
    readonly tone: 'danger' | 'warning' | 'success';
    readonly reasons: readonly string[];
  };
  /** Binding rule 3 — carried, never dropped. */
  readonly unverifiedNote: string | null;
}

/* ═════════════════════════════════════════════════
 * 2 · finance.summary → the commingling facts only
 * ═════════════════════════════════════════════════ */

export interface ComminglingView {
  readonly accountsChecked: number;
  readonly nonDedicatedAccounts: number;
  readonly receiptsOnNonDedicated: number;
}

/* ═════════════════════════════════════════════════
 * 3 · compliance.amlKpi
 * ═════════════════════════════════════════════════ */

export interface AmlKpiView {
  /** `true` = a report was due and not filed · `false` = none missed · `null` = not assessable. */
  readonly missedReports: boolean | null;
  readonly assessable: boolean;
  readonly reason: string;
}

/* ═════════════════════════════════════════════════
 * 4 · beneficiary.list → KYC freshness per row
 * ═════════════════════════════════════════════════ */

export type KycFreshness = 'FRESH' | 'STALE' | 'UNVERIFIED';

export interface KycRowView {
  readonly id: string;
  readonly freshness: KycFreshness;
  readonly lastRefreshed: DualDate | null;
}

export interface KycView {
  readonly rows: readonly KycRowView[];
  readonly counts: Readonly<Record<KycFreshness, number>>;
}

/* ═════════════════════════════════════════════════
 * 5 · filing.list
 * ═════════════════════════════════════════════════ */

export interface FilingRowView {
  readonly id: string;
  readonly platform: string;
  readonly status: string;
  readonly lastUpdated: DualDate | null;
}

export interface FilingsView {
  readonly rows: readonly FilingRowView[];
  /** BR-603 stated by the kernel, rendered verbatim on the board. */
  readonly manualStatusNote: string;
}

/* ═════════════════════════════════════════════════
 * 6 · The board for ONE endowment — five reads, each carried as Loaded<>
 * ═════════════════════════════════════════════════ */

export interface EndowmentBoard {
  readonly waqfId: string;
  readonly certificateNumber: string | null;
  readonly deadlines: Loaded<DeadlineBoardView>;
  readonly commingling: Loaded<ComminglingView>;
  readonly aml: Loaded<AmlKpiView>;
  readonly kyc: Loaded<KycView>;
  readonly filings: Loaded<FilingsView>;
  /** The five chips, composed by `@qmulate/api`'s pure function from the five reads above. */
  readonly kpis: readonly KpiChip[];
  /** "Danger dominates": the worst tone across the five chips. */
  readonly dominant: KpiTone;
}

/** The roll-up strip: one line per readable endowment — its dominant tone, or its refusal. */
export interface RollupLine {
  readonly waqfId: string;
  readonly certificateNumber: string | null;
  readonly dominant: KpiTone;
  readonly overdueRows: number;
}
