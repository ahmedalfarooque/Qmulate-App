/**
 * Route helpers for the distribution and approval surfaces, and the wizard's step model.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE WIZARD'S STATE LIVES IN THE URL, AND THAT IS THE ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every panel this wizard needs — the refusal, the diagnostic code, the vocabulary label, the
 * unverified marker, the dual date — is an `async` SERVER component using `getTranslations`, and not
 * one of them can be rendered inside a `'use client'` tree. A client-side wizard would have to
 * duplicate all of them, and with them the ONE refusal choke point.
 *
 * So the step is a search param, each step is a server render, and moving between steps is a `<Link>`
 * or a native `<form method="get">`. The consequences are all in the right direction: the state is
 * shareable, the back button works, a refusal is server-rendered by the same component the endowment
 * screens use, and there is no client JavaScript in the money path at all.
 *
 * `encodeURIComponent` on every interpolated id is not decoration: a `waqfId` or a `distributionId`
 * reaches these helpers from a route segment or an API payload, and a value carrying a `/` or a `?`
 * would silently re-target the link.
 */

import type { RunPeriod } from './types';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The steps
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The wizard's four steps, in order.
 *
 * `period` is ALSO THE RECEIPT STEP, and that is not a shortcut. The catalogue's own body copy for it
 * reads "the period's receipts are read from the ledger with the classification recorded at entry;
 * nothing is classified here" — which is exactly what that screen shows: the window, and every receipt
 * the window contains, with the corpus rows struck through and named. There is no *selection* to make.
 * A receipt's income-vs-capital class was decided at ENTRY, by a database CHECK constraint that makes an
 * unclassified `REVENUE` row impossible; a wizard offering a checkbox beside it would imply the class
 * were a choice available here, which is the one thing it must never imply.
 */
export const WIZARD_STEPS = ['period', 'waterfall', 'lines', 'review'] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

/** The catalogue leaf under `distribution.wizard` for each step's title and body. */
export const WIZARD_STEP_KEY: Readonly<
  Record<WizardStep, 'Period' | 'Waterfall' | 'Lines' | 'Review'>
> = {
  period: 'Period',
  waterfall: 'Waterfall',
  lines: 'Lines',
  review: 'Review',
};

/** Narrow an untrusted search param to a step. Anything else starts at the beginning. */
export function toWizardStep(value: unknown): WizardStep {
  return typeof value === 'string' && (WIZARD_STEPS as readonly string[]).includes(value)
    ? (value as WizardStep)
    : 'period';
}

/** The step after `step`, or `null` at the end. */
export function nextStep(step: WizardStep): WizardStep | null {
  const at = WIZARD_STEPS.indexOf(step);
  return WIZARD_STEPS[at + 1] ?? null;
}

/** The step before `step`, or `null` at the beginning. */
export function previousStep(step: WizardStep): WizardStep | null {
  const at = WIZARD_STEPS.indexOf(step);
  return at <= 0 ? null : (WIZARD_STEPS[at - 1] ?? null);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The period, validated as a SHAPE and never as a value
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `yyyy-MM-dd` — the civil-date spelling every boundary in this repository uses.
 *
 * ⚠ THIS IS A SHAPE CHECK, NOT A CALENDAR CHECK, AND THE DIFFERENCE IS DELIBERATE. `2026-02-31` passes
 * here and is refused by the kernel, which is the correct division of labour: this app cannot import
 * `@qmulate/domain`, so it has no calendar of record, and a second date implementation in the browser's
 * language is exactly how two answers to "which period is this" get created. The regex keeps a
 * malformed param out of a URL; the engine decides whether the day exists.
 */
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCivilDate(value: unknown): value is string {
  return typeof value === 'string' && CIVIL_DATE.test(value);
}

/**
 * A period from two untrusted params, or `null`.
 *
 * `null` when either bound is missing OR malformed — the wizard then shows the period form rather than
 * calling the kernel with a value it already knows is wrong. It does NOT check `start <= end`: the
 * engine's `assertInputConsistency` owns that, and duplicating it here would produce a second, silently
 * disagreeing opinion about a fiscal window.
 */
export function toRunPeriod(start: unknown, end: unknown): RunPeriod | null {
  return isCivilDate(start) && isCivilDate(end) ? { start, end } : null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Hrefs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export function distributionsPath(locale: string): string {
  return `/${locale}/distributions`;
}

export function endowmentRunsPath(locale: string, waqfId: string): string {
  return `${distributionsPath(locale)}/${encodeURIComponent(waqfId)}`;
}

export function runPath(locale: string, waqfId: string, distributionId: string): string {
  return `${endowmentRunsPath(locale, waqfId)}/runs/${encodeURIComponent(distributionId)}`;
}

export function approvalsPath(locale: string): string {
  return `/${locale}/approvals`;
}

/**
 * The wizard, at a given step and period.
 *
 * ⚠ `new` IS A STATIC SEGMENT AND THE RUN DETAIL LIVES UNDER `runs/`, so a `distributionId` that
 * happened to be the literal string `new` cannot shadow the wizard's own route. A dynamic segment
 * sitting directly beside a static one is a collision waiting for its first strange id.
 */
export function newRunPath(
  locale: string,
  waqfId: string,
  options?: { readonly period?: RunPeriod | null; readonly step?: WizardStep },
): string {
  const base = `${endowmentRunsPath(locale, waqfId)}/new`;
  const params = new URLSearchParams();
  const period = options?.period ?? null;
  if (period !== null) {
    params.set('periodStart', period.start);
    params.set('periodEnd', period.end);
  }
  if (options?.step !== undefined) params.set('step', options.step);
  const query = params.toString();
  return query === '' ? base : `${base}?${query}`;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Carrying a refusal back from a server action
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The search param a refused mutation lands in.
 *
 * ⚠ WHY A URL PARAM AND NOT `useActionState`. The alternative needs a client component, which would put
 * the refusal's rendering outside the server-component choke point every other refusal in this app goes
 * through — and a mutation is the one place a wrong sentence is most expensive.
 *
 * ⚠ AND THE VALUE IS RE-VALIDATED WHERE IT IS READ, NEVER TRUSTED BECAUSE THE ACTION WROTE IT. It is a
 * URL param: a caller can type anything into it. Both the writer and the reader push it through
 * `kernelMessageKey`, which checks the prefix against the two error namespaces, checks the remainder
 * looks like a machine code, and checks the key EXISTS in the catalogue — degrading to `errors.generic`
 * otherwise. Without that, any string arriving here could pull an arbitrary catalogue entry into the
 * error slot, and `auth.password` rendered as an error message is a confusing lie.
 */
export const REFUSAL_PARAM = 'refusal';

/** Append a validated refusal key to a path. */
export function withRefusal(path: string, messageKey: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${REFUSAL_PARAM}=${encodeURIComponent(messageKey)}`;
}
