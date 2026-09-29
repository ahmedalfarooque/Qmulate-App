import 'server-only';

import { deriveFinancialEmptyReason } from '@qmulate/api';

import { loadEndowmentRefs } from '@/lib/distributions/loaders';
import { kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

import type { FinancialBoard, FinancialRollupLine } from './types';
import type { Loaded } from '@/lib/endowments/types';

/**
 * ═══════════════════════════════════════════════════════
 * `/financials`' READS — ONE kernel procedure per endowment, carried as `Loaded<>`
 * ═══════════════════════════════════════════════════════
 *
 * S11 · 2c (E10). `finance.summary` is the ONLY endowment-scoped call this screen makes, which is why
 * the seat that drives it needs exactly two verbs (`finance:transaction:read` for the figures, and
 * `endowment:waqf:read` so `navigation.tree` will disclose the certificate number that LABELS them).
 * The bank-account rows and the distribution aggregates come back inside that one call, so no
 * bank-account or distribution verb has a caller here.
 *
 *  · A REFUSED READ IS CARRIED, NEVER SWALLOWED. `{ status: 'refused', messageKey }` renders as a
 *    sentence saying the read was refused. A zero would be a claim about the endowment's money made
 *    from a failed request, which on this screen is the most dangerous thing the code could do.
 *  · NOTHING IS PARSED INTO A NUMBER. Money stays a 2-dp string end to end.
 *  · THE EMPTY STATE IS KEYED ON THE ACCOUNT COUNT, not on "the total is zero" — see
 *    {@link deriveFinancialEmptyReason}.
 */

async function attempt<T>(read: () => Promise<T>, locale: string): Promise<Loaded<T>> {
  try {
    return { status: 'ok', value: await read() };
  } catch (error) {
    return { status: 'refused', messageKey: kernelMessageKey(error, locale) };
  }
}

/**
 * ⚠ THE PREDICATE ITSELF LIVES IN `@qmulate/api` (`deriveFinancialEmptyReason`), not here — because
 * `apps/web` has no unit-test runner, so a rule written in this file could only ever be executed by
 * the E2E leg. Re-exported for the screen's convenience; the reasoning is at the definition.
 */
export { deriveFinancialEmptyReason } from '@qmulate/api';

export async function loadFinancialBoard(
  locale: string,
  waqfId: string,
  certificateNumber: string | null,
): Promise<Loaded<FinancialBoard>> {
  const summary = await attempt(async () => {
    const caller = await getServerCaller(locale);
    return caller.finance.summary({ waqfId });
  }, locale);

  if (summary.status !== 'ok') return summary;
  const value = summary.value;

  return {
    status: 'ok',
    value: {
      waqfId,
      certificateNumber,
      directUtilization: value.directUtilization,
      cash: {
        totalSar: value.cashPosition.totalSar,
        ofWhichCapitalSar: value.cashPosition.ofWhichCapitalSar,
        accounts: value.cashPosition.accounts.map((account) => ({
          id: account.id,
          accountRef: account.accountRef,
          purpose: account.purpose,
          isDedicated: account.isDedicated,
          currency: account.currency,
          netSar: account.netSar,
          ofWhichCapitalSar: account.ofWhichCapitalSar,
        })),
      },
      receipts: {
        incomeSar: value.receipts.incomeSar,
        capitalSar: value.receipts.capitalSar,
        capitalBySource: value.receipts.capitalBySource.map((row) => ({
          source: row.source,
          amountSar: row.amountSar,
        })),
      },
      expenses: {
        totalSar: value.expenses.totalSar,
        byCategory: value.expenses.byCategory.map((row) => ({
          category: row.category,
          amountSar: row.amountSar,
        })),
      },
      distributions: {
        count: value.distributions.count,
        byStatus: value.distributions.byStatus.map((row) => ({
          status: row.status,
          count: row.count,
        })),
        executedDistributableSar: value.distributions.executedDistributableSar,
      },
      arrears: value.arrears,
      commingling: value.commingling,
      excludedRows: value.excludedRows,
      emptyReason: deriveFinancialEmptyReason(
        value.cashPosition.accounts.length,
        value.directUtilization,
      ),
    },
  };
}

/**
 * The portfolio strip: one line per endowment in the caller's own scope. A board this seat cannot
 * read is a `refused: true` line — present and honest — never a missing row and never a zero.
 */
export async function loadFinancialRollup(locale: string): Promise<
  Loaded<{
    readonly lines: readonly FinancialRollupLine[];
    readonly boards: readonly FinancialBoard[];
  }>
> {
  const refs = await loadEndowmentRefs(locale);
  if (refs.status !== 'ok') return refs;

  const lines: FinancialRollupLine[] = [];
  const boards: FinancialBoard[] = [];

  for (const ref of refs.value) {
    const board = await loadFinancialBoard(locale, ref.waqfId, ref.certificateNumber);
    if (board.status === 'ok') {
      boards.push(board.value);
      lines.push({
        waqfId: ref.waqfId,
        certificateNumber: ref.certificateNumber,
        totalSar: board.value.cash.totalSar,
        ofWhichCapitalSar: board.value.cash.ofWhichCapitalSar,
        refused: false,
      });
    } else {
      lines.push({
        waqfId: ref.waqfId,
        certificateNumber: ref.certificateNumber,
        totalSar: null,
        ofWhichCapitalSar: null,
        refused: true,
      });
    }
  }

  return { status: 'ok', value: { lines, boards } };
}
