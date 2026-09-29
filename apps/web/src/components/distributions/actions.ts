'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { endowmentRunsPath, newRunPath, runPath, withRefusal } from '@/lib/distributions/paths';
import { kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

import { isCivilDate } from '@/lib/distributions/paths';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FIRST MUTATIONS THIS APP HAS EVER HAD
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Before S7 `apps/web` contained no server action, no `useMutation`, and no writer in any loader — the
 * whole product was read-only. These four verbs are the first, and they are money movement and
 * approval, so the shape is chosen to be conservative rather than convenient:
 *
 *  1. **Server actions, not client mutations.** `TrpcProvider`'s defaults are `retry: false` for
 *     mutations precisely because "a retried mutation is a second attempt at a money movement or
 *     approval". A server action is invoked once, by a form POST, and its result is a redirect — there
 *     is no client cache to reconcile and nothing to retry silently.
 *  2. **The kernel is the authorization boundary, and it is the ONLY one.** Nothing here checks a
 *     permission, a role, or a session. Every verb goes through the composed middleware chain
 *     (`makerProcedure` / `checkerProcedure`, the endowment scope, segregation of duties, the TOTP
 *     step-up, the artifact-verification ladder) from the caller's own scoped Prisma client. The
 *     screens read `whoami` to avoid OFFERING a control that is certain to be refused; that is a
 *     courtesy and is re-decided here, below it, on every call.
 *  3. **A refusal becomes a catalogued sentence, never a raw message.** `ApiError.message` is developer
 *     English quoting the endowment id and the refused permission; rendering it would put untranslated
 *     English in front of an Arabic-first user and re-disclose exactly what `NO_GRANT → NOT_FOUND`
 *     exists to withhold. So every catch routes through `kernelMessageKey` — the one choke point,
 *     which validates the key against both error namespaces and degrades to `errors.generic`.
 *  4. **Nothing is claimed to be atomic that is not.** `submitRun` is TWO kernel calls, `create` then
 *     `submit`, and they are two transactions. If the second refuses, the run exists as `COMPUTED` with
 *     no approval — a real, visible, recoverable state, and the redirect lands on the run's own page
 *     where the Submit control is offered again. Pretending otherwise would be worse than the state.
 *
 * ── WHY THE REFUSAL TRAVELS IN THE URL ────────────────────────────────────────────────────────
 * `useActionState` would need a client component, which would put the refusal's rendering outside the
 * server-component choke point every other refusal in this app goes through. So the action redirects
 * with `?refusal=<validated key>` and the page re-validates it before rendering. Both ends push the
 * value through `kernelMessageKey`: the writer because it is producing it, the reader because a URL
 * param is caller input and a catalogue is not an authorization boundary.
 *
 * ⚠ `redirect()` THROWS, BY DESIGN, and the throw must not be caught. Every `redirect` below is outside
 * its `try`, so Next's control-flow signal is never swallowed by the refusal handler.
 */

/** The narrow shape a form field must satisfy before it is passed to the kernel. */
function requireId(value: FormDataEntryValue | null, field: string): string {
  if (typeof value !== 'string' || value === '' || value.length > 128) {
    throw new Error(`${field} is missing or malformed`);
  }
  return value;
}

/**
 * Compute the period, persist it as `COMPUTED`, then submit it for the Nazir's approval.
 *
 * `create` needs `distribution:run:write` (the `finance` preset alone) and `submit` needs
 * `distribution:run:initiate`. Note what the `nazir` preset deliberately holds NEITHER of: the Nazir is
 * the CHECKER on money movement and must never be the maker (§4.2). A Nazir invoking this is refused by
 * the kernel, and the screen does not offer it to them.
 */
export async function submitRunAction(formData: FormData): Promise<void> {
  const locale = requireId(formData.get('locale'), 'locale');
  const waqfId = requireId(formData.get('waqfId'), 'waqfId');
  const periodStart = requireId(formData.get('periodStart'), 'periodStart');
  const periodEnd = requireId(formData.get('periodEnd'), 'periodEnd');

  if (!isCivilDate(periodStart) || !isCivilDate(periodEnd)) {
    // A malformed window never reaches the kernel: the engine brands both bounds as civil dates and an
    // instant with a time of day would move a fiscal period by up to a day.
    redirect(newRunPath(locale, waqfId));
  }

  let created: string | null = null;
  let failure: string | null = null;

  try {
    const caller = await getServerCaller(locale);
    const run = await caller.distribution.create({ waqfId, periodStart, periodEnd });
    created = run.distributionId;
    await caller.distribution.submit({ waqfId, distributionId: run.distributionId });
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(`/${locale}/distributions`);
  revalidatePath(`/${locale}/approvals`);
  revalidatePath(`/${locale}/dashboard`);

  // ⚠ THE THREE OUTCOMES ARE THREE DESTINATIONS, and the middle one is the honest half-success:
  // `create` committed and `submit` did not, so the run exists and its own page is where the refusal
  // belongs — beside a Submit control the maker can use again.
  if (created !== null && failure !== null) {
    redirect(withRefusal(runPath(locale, waqfId, created), failure));
  }
  if (created === null && failure !== null) {
    redirect(
      withRefusal(
        newRunPath(locale, waqfId, {
          period: { start: periodStart, end: periodEnd },
          step: 'review',
        }),
        failure,
      ),
    );
  }
  // ⚠ THE FOURTH BRANCH IS UNREACHABLE AND IS STILL WRITTEN OUT. `created === null && failure === null`
  // cannot happen — the `try` either assigns `created` or the `catch` assigns `failure` — but
  // `runPath(…, created ?? '')` would have produced `/runs/` and a 404 for a state the code claims is
  // impossible. Landing on the endowment's run list is the honest fallback: it shows whatever actually
  // exists, rather than a URL asserting the id of a run nobody created.
  redirect(created === null ? endowmentRunsPath(locale, waqfId) : runPath(locale, waqfId, created));
}

/**
 * Submit an already-persisted `COMPUTED` run for approval, minting its ONE `DISTRIBUTION_RUN` approval.
 *
 * The approval's payload carries `engineVersion` and `runDigest`, which is how the engine BUILD enters
 * what the Nazir signs: a re-run under a different build produces a different digest and voids the
 * fingerprint instead of quietly executing.
 */
export async function submitStoredRunAction(formData: FormData): Promise<void> {
  const locale = requireId(formData.get('locale'), 'locale');
  const waqfId = requireId(formData.get('waqfId'), 'waqfId');
  const distributionId = requireId(formData.get('distributionId'), 'distributionId');

  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    await caller.distribution.submit({ waqfId, distributionId });
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(`/${locale}/distributions`);
  revalidatePath(`/${locale}/approvals`);
  revalidatePath(`/${locale}/dashboard`);

  const destination = runPath(locale, waqfId, distributionId);
  redirect(failure === null ? destination : withRefusal(destination, failure));
}

/**
 * APPROVE the run — the checker's rung.
 *
 * ⚠ `approval.approve` IS THIS PACKAGE'S ONE APPROVING PATH, and it is used here rather than a dedicated
 * `distribution.run.approve` for the same reason `finance.bankMovement` does not re-implement it: a
 * second approving path would restate the guard chain, the MP-32 authority context and the no-`select`
 * rule. The deviation it carries is recorded and not settled — the run's checker gate is therefore
 * `approval:request:approve`, while `distribution:run:approve` and `distribution:run:sign` are
 * registered, `nazir`-only, and held by NO procedure.
 *
 * Everything about authority is decided before the body runs: the acting identity ≠ the PERSISTED
 * `makerId` (an identity test, not a role test — the maker is refused even when they are also the
 * Nazir), an ACTIVE `NAZIR` grant on THIS endowment, a fresh TOTP inside the `Setting`-driven window, the
 * `payloadHash` re-verification (which VOIDS a changed artifact rather than executing it), and the
 * `PENDING` open-status gate.
 */
export async function approveRunAction(formData: FormData): Promise<void> {
  const locale = requireId(formData.get('locale'), 'locale');
  const waqfId = requireId(formData.get('waqfId'), 'waqfId');
  const distributionId = requireId(formData.get('distributionId'), 'distributionId');
  const approvalRequestId = requireId(formData.get('approvalRequestId'), 'approvalRequestId');

  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    await caller.approval.approve({ waqfId, approvalRequestId });
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(`/${locale}/distributions`);
  revalidatePath(`/${locale}/approvals`);
  revalidatePath(`/${locale}/dashboard`);

  const destination = runPath(locale, waqfId, distributionId);
  redirect(failure === null ? destination : withRefusal(destination, failure));
}

/**
 * Write the line items and post the run — the last step, and the only one that records money as owed.
 *
 * A `makerProcedure`, not a checker one, and the reason is measured rather than stylistic:
 * `checkerProcedure` requires the approval to still be `PENDING`, while this path requires it to be
 * `APPROVED`. The combination cannot succeed.
 *
 * Eight ordered checks stand between an approval and a posted run, and every one of them refuses with
 * `DISTRIBUTION_RUN_NOT_AUTHORISED` so a caller cannot tell "no approval" from "wrong endowment" by
 * status code. The one that has no analogue on the bank-movement path is the last: a distribution run's
 * artifact is a ROW, so the approved digest and the run's own digest must be compared, or the approval
 * would bind to figures the run no longer carries.
 */
export async function executeRunAction(formData: FormData): Promise<void> {
  const locale = requireId(formData.get('locale'), 'locale');
  const waqfId = requireId(formData.get('waqfId'), 'waqfId');
  const distributionId = requireId(formData.get('distributionId'), 'distributionId');
  const approvalRequestId = requireId(formData.get('approvalRequestId'), 'approvalRequestId');

  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    await caller.distribution.execute({ waqfId, distributionId, approvalRequestId });
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(`/${locale}/distributions`);
  revalidatePath(`/${locale}/approvals`);
  revalidatePath(`/${locale}/dashboard`);

  const destination = runPath(locale, waqfId, distributionId);
  redirect(failure === null ? destination : withRefusal(destination, failure));
}
