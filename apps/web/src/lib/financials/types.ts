/**
 * `lib/financials/types.ts` — the view shapes `/financials` renders. **S11 · 2c (E10).**
 *
 * Money crosses this boundary as the kernel's own 2-dp STRINGS and is never parsed into a number:
 * `Decimal(18,2)` through `JSON.parse` is a float, and a float is not a figure a Nazir signs. Every
 * `*Sar` field below is therefore `string`, formatted for display and compared as BigInt halalas
 * where a test needs arithmetic.
 *
 * ⚠ THE ONE INVARIANT THIS FILE ENCODES: a blended figure never travels without its corpus
 * companion. `AccountView` pairs `netSar` with a REQUIRED `ofWhichCapitalSar`, and the pairing is in
 * the TYPE rather than in a convention, because the defect this screen was built after was exactly a
 * blended figure published with nothing beside it saying how much was principal.
 */
/** ⊕ S11 · 2c — the vocabulary is the kernel's; the screen never invents a state. */
import type { FinancialEmptyReason } from '@qmulate/api';

export type EmptyReason = FinancialEmptyReason;

export interface AccountView {
  readonly id: string;
  readonly accountRef: string;
  readonly purpose: string;
  readonly isDedicated: boolean;
  readonly currency: string;
  /** Receipts minus expenses on this account — MIXES income and corpus by construction. */
  readonly netSar: string;
  /** REQUIRED. How much of `netSar` is corpus (asl) and may never be distributed. */
  readonly ofWhichCapitalSar: string;
}

export interface CapitalSourceView {
  readonly source: string;
  readonly amountSar: string;
}

export interface CategoryView {
  readonly category: string;
  readonly amountSar: string;
}

export interface StatusCountView {
  readonly status: string;
  readonly count: number;
}

export interface FinancialBoard {
  readonly waqfId: string;
  readonly certificateNumber: string | null;
  /**
   * `true` = beneficiaries use the asset itself, no ghallah is distributed (§14 §5.1(3));
   * `false` = a distributing endowment; `null` = **UNRECORDED**, never "not direct use".
   */
  readonly directUtilization: boolean | null;
  readonly cash: {
    readonly totalSar: string;
    readonly ofWhichCapitalSar: string;
    readonly accounts: readonly AccountView[];
  };
  readonly receipts: {
    readonly incomeSar: string;
    readonly capitalSar: string;
    readonly capitalBySource: readonly CapitalSourceView[];
  };
  readonly expenses: {
    readonly totalSar: string;
    readonly byCategory: readonly CategoryView[];
  };
  readonly distributions: {
    readonly count: number;
    readonly byStatus: readonly StatusCountView[];
    readonly executedDistributableSar: string;
  };
  /** The wire's own discriminator. Rendered as a SENTENCE, never as a zero. */
  readonly arrears: { readonly state: 'NOT_MODELLED' };
  readonly commingling: {
    readonly accountsChecked: number;
    readonly nonDedicatedAccounts: number;
    readonly receiptsOnNonDedicated: number;
  };
  readonly excludedRows: number;
  /**
   * Which empty state applies, or `null` when there is a position to show. Derived from the ACCOUNT
   * COUNT and the direct-use axis — never from "the total is zero", because a real endowment holding
   * a linked account at nil balance would then be told to link an account.
   */
  readonly emptyReason: EmptyReason | null;
}

export interface FinancialRollupLine {
  readonly waqfId: string;
  readonly certificateNumber: string | null;
  readonly totalSar: string | null;
  readonly ofWhichCapitalSar: string | null;
  readonly refused: boolean;
}
