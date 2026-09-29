'use server';

/**
 * ⊕ S12-3 · the onboarding tab's two writes: CLEAR a gate (a staff act over the facts on record, with
 * the operating model's checklist attested item by item) and REOPEN one (the Nazir's act, with a
 * reason). Same shape as `anchor-actions.ts`: read the fields, call the real procedure through the
 * server caller, redirect back to the tab with a notice or the refusal's message key.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { withRefusal } from '@/lib/distributions/paths';
import { withNotice } from '@/lib/endowments/anchor-notices';
import { endowmentPath } from '@/lib/endowments/paths';
import { kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

const GATES = [
  'GATE_01_AUTHORITY_LEGAL',
  'GATE_02_SYSTEMS_CONTROLS',
  'GATE_03_PEOPLE_PROPERTY_CADENCE',
] as const;
type Gate = (typeof GATES)[number];

function isGate(value: string): value is Gate {
  return (GATES as readonly string[]).includes(value);
}

function requireField(value: FormDataEntryValue | null, field: string, max = 128): string {
  if (typeof value !== 'string' || value === '' || value.length > max) {
    throw new Error(`${field} is missing or malformed`);
  }
  return value;
}

const ATTEST_PREFIX = 'attest:';

export async function clearGateAction(formData: FormData): Promise<void> {
  const locale = requireField(formData.get('locale'), 'locale');
  const waqfId = requireField(formData.get('waqfId'), 'waqfId');
  const gate = requireField(formData.get('gate'), 'gate');
  const noteRaw = formData.get('note');
  const note =
    typeof noteRaw === 'string' && noteRaw.trim() !== '' ? noteRaw.slice(0, 2048) : undefined;
  const destination = endowmentPath(locale, waqfId, 'onboarding');

  if (!isGate(gate)) redirect(withRefusal(destination, 'errors.generic'));

  // Every checked box arrives as `attest:<item>=on`; the procedure decides whether the set is complete.
  const attestation: Record<string, boolean> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith(ATTEST_PREFIX) && typeof value === 'string') {
      attestation[key.slice(ATTEST_PREFIX.length)] = value === 'on' || value === 'true';
    }
  }

  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    await caller.onboarding.clearGate({
      waqfId,
      gate,
      attestation,
      ...(note !== undefined ? { note } : {}),
    });
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(destination);
  revalidatePath(`/${locale}/dashboard`);
  redirect(
    failure !== null ? withRefusal(destination, failure) : withNotice(destination, 'gateCleared'),
  );
}

export async function reopenGateAction(formData: FormData): Promise<void> {
  const locale = requireField(formData.get('locale'), 'locale');
  const waqfId = requireField(formData.get('waqfId'), 'waqfId');
  const gate = requireField(formData.get('gate'), 'gate');
  const reason = requireField(formData.get('reason'), 'reason', 2048);
  const destination = endowmentPath(locale, waqfId, 'onboarding');

  if (!isGate(gate)) redirect(withRefusal(destination, 'errors.generic'));

  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    await caller.onboarding.reopenGate({ waqfId, gate, reason });
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(destination);
  redirect(
    failure !== null ? withRefusal(destination, failure) : withNotice(destination, 'gateReopened'),
  );
}
