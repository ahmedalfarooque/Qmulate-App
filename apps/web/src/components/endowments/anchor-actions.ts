'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { isCivilDate, withRefusal } from '@/lib/distributions/paths';
import { withNotice, type AnchorNotice } from '@/lib/endowments/anchor-notices';
import { endowmentPath } from '@/lib/endowments/paths';
import { kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

/**
 * ⊕ S11-1 — the FIRST web write surface for a waqf-level field: the clock-start dates the owner
 * ruled are "an input field that i can put" (9f3d8fd), editable with the audit log as the history
 * (f57e13d).
 *
 * ── THE SAME SHAPE AS `distributions/actions.ts`, FOR THE SAME REASONS ─────────────────────────
 * Server actions, one kernel call each through the in-process caller, a refusal carried back as a
 * validated URL param (`withRefusal`) and rendered by the SAME `<Refusal>` choke point every other
 * refusal in this app goes through. No client component, no `useActionState`.
 *
 * ── WHAT THE ACTION SENDS, AND WHAT IT DOES NOT ──────────────────────────────────────────────
 * The browser's `type="date"` submits `yyyy-MM-dd`; the kernel takes an ISO instant, so the day is
 * widened to UTC midnight here — the same convention every dual-date column stores. ⚠ NO HIJRI TWIN
 * IS SENT. This app has no calendar implementation by design (ADR-0007: one Umm al-Qura
 * implementation, in `@qmulate/domain`, which `apps/web` does not depend on); the kernel derives the
 * frozen snapshot itself and that derivation IS the record. The outcome the kernel reports —
 * computed, recorded-but-not-computable, cleared — becomes a `notice` param the record page renders
 * from the catalogue, so "the deadline could not be computed" is a sentence on screen and never a
 * silent green.
 *
 * ⚠ ONLY ASYNC FUNCTIONS ARE EXPORTED FROM THIS FILE — Next's rule for a `'use server'` module, and
 * `next build` enforces it where `tsc` cannot (measured on the stage's first E2E leg). The notice
 * vocabulary lives in `@/lib/endowments/anchor-notices`.
 */

function requireField(value: FormDataEntryValue | null, field: string): string {
  if (typeof value !== 'string' || value === '' || value.length > 128) {
    throw new Error(`${field} is missing or malformed`);
  }
  return value;
}

const KINDS = ['WAQF_DOCUMENTATION_DATE', 'REGULATION_EFFECTIVE_DATE'] as const;
type Kind = (typeof KINDS)[number];

function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

export async function recordRegistrationAnchorAction(formData: FormData): Promise<void> {
  const locale = requireField(formData.get('locale'), 'locale');
  const waqfId = requireField(formData.get('waqfId'), 'waqfId');
  const day = requireField(formData.get('date'), 'date');
  const kind = requireField(formData.get('kind'), 'kind');
  const destination = endowmentPath(locale, waqfId);

  // A malformed day or an unknown kind never reaches the kernel: both are closed vocabularies at the
  // boundary, and the kernel would refuse them anyway — this just keeps the refusal readable.
  if (!isCivilDate(day) || !isKind(kind)) {
    redirect(withRefusal(destination, 'errors.generic'));
  }

  let notice: AnchorNotice | null = null;
  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    const result = await caller.deadline.recordRegistrationAnchor({
      waqfId,
      date: `${day}T00:00:00.000Z`,
      kind,
      triggerEvent: 'endowment record — registration clock-start recorded by the operator',
    });
    notice = result.computeRefusal === null ? 'anchorSaved' : 'anchorSavedNotComputable';
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(destination);
  revalidatePath(`/${locale}/dashboard`);
  redirect(
    failure !== null
      ? withRefusal(destination, failure)
      : withNotice(destination, notice ?? 'anchorSaved'),
  );
}

export async function clearRegistrationAnchorAction(formData: FormData): Promise<void> {
  const locale = requireField(formData.get('locale'), 'locale');
  const waqfId = requireField(formData.get('waqfId'), 'waqfId');
  const destination = endowmentPath(locale, waqfId);

  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    await caller.deadline.recordRegistrationAnchor({
      waqfId,
      date: null,
      kind: null,
      triggerEvent: 'endowment record — registration clock-start cleared by the operator',
    });
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(destination);
  revalidatePath(`/${locale}/dashboard`);
  redirect(
    failure !== null ? withRefusal(destination, failure) : withNotice(destination, 'anchorCleared'),
  );
}

export async function recordIstibdalCompletionAction(formData: FormData): Promise<void> {
  const locale = requireField(formData.get('locale'), 'locale');
  const waqfId = requireField(formData.get('waqfId'), 'waqfId');
  const expropriationId = requireField(formData.get('expropriationId'), 'expropriationId');
  const day = requireField(formData.get('date'), 'date');
  const destination = endowmentPath(locale, waqfId);

  if (!isCivilDate(day)) {
    redirect(withRefusal(destination, 'errors.generic'));
  }

  let notice: AnchorNotice | null = null;
  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    const result = await caller.deadline.recordIstibdalCompletion({
      waqfId,
      expropriationId,
      date: `${day}T00:00:00.000Z`,
      triggerEvent: 'endowment record — istibdal completion recorded by the operator',
    });
    notice = result.computeRefusal === null ? 'istibdalSaved' : 'istibdalSavedNotComputable';
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(destination);
  revalidatePath(`/${locale}/dashboard`);
  redirect(
    failure !== null
      ? withRefusal(destination, failure)
      : withNotice(destination, notice ?? 'istibdalSaved'),
  );
}

export async function clearIstibdalCompletionAction(formData: FormData): Promise<void> {
  const locale = requireField(formData.get('locale'), 'locale');
  const waqfId = requireField(formData.get('waqfId'), 'waqfId');
  const expropriationId = requireField(formData.get('expropriationId'), 'expropriationId');
  const destination = endowmentPath(locale, waqfId);

  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    await caller.deadline.recordIstibdalCompletion({
      waqfId,
      expropriationId,
      date: null,
      triggerEvent: 'endowment record — istibdal completion cleared by the operator',
    });
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(destination);
  revalidatePath(`/${locale}/dashboard`);
  redirect(
    failure !== null
      ? withRefusal(destination, failure)
      : withNotice(destination, 'istibdalCleared'),
  );
}

/**
 * ⊕ S11-2 — the discharge (owner ruling f797fea). The date is the ONLY thing the browser sends; the
 * kernel derives the Hijri twin, proves the date against the clock-start and today, marks the head
 * deadline met, and mirrors the bound task. The four named refusals come back as NOTICES (closed words
 * the record page renders in the warning tone) because a `GATE_NOT_CLEARED` refusal's `messageKey`
 * collapses to one generic sentence at `kernelMessageKey` — the wrong sentence for "already discharged".
 * The `reason` is read server-side off the in-process error and never reaches the DOM as a code.
 */
export async function dischargeRegistrationDutyAction(formData: FormData): Promise<void> {
  const locale = requireField(formData.get('locale'), 'locale');
  const waqfId = requireField(formData.get('waqfId'), 'waqfId');
  const day = requireField(formData.get('date'), 'date');
  const destination = endowmentPath(locale, waqfId);

  if (!isCivilDate(day)) {
    redirect(withRefusal(destination, 'errors.generic'));
  }

  let notice: AnchorNotice | null = null;
  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    await caller.deadline.dischargeRegistrationDuty({
      waqfId,
      dischargedOn: `${day}T00:00:00.000Z`,
      triggerEvent: 'endowment record — registration duty recorded as discharged by the operator',
    });
    notice = 'dischargeSaved';
  } catch (error) {
    const refused = dischargeRefusalNotice(error);
    if (refused !== null) notice = refused;
    else failure = kernelMessageKey(error, locale);
  }

  revalidatePath(destination);
  revalidatePath(`/${locale}/dashboard`);
  redirect(
    failure !== null
      ? withRefusal(destination, failure)
      : withNotice(destination, notice ?? 'dischargeSaved'),
  );
}

/** The kernel's named refusal → the closed notice word, or `null` for anything else (generic path). */
function dischargeRefusalNotice(error: unknown): AnchorNotice | null {
  if (typeof error !== 'object' || error === null) return null;
  const cause = (error as { cause?: unknown }).cause;
  const details =
    typeof cause === 'object' && cause !== null
      ? (cause as { details?: { reason?: unknown } }).details
      : undefined;
  switch (details?.reason) {
    case 'REGISTRATION_ALREADY_DISCHARGED':
      return 'dischargeRefusedAlready';
    case 'NO_REGISTRATION_DEADLINE_ON_RECORD':
      return 'dischargeRefusedNoDeadline';
    case 'DISCHARGE_PRECEDES_CLOCK_START':
      return 'dischargeRefusedPrecedes';
    case 'DISCHARGE_IN_FUTURE':
      return 'dischargeRefusedFuture';
    default:
      return null;
  }
}
