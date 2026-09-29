'use server';

/**
 * ⊕ S12-2 · the reserved-matters tab's ONE write: recording a BR-1102 chain step as received
 * (owner ruling 2026-09-08, "staff"). One action, three steps — the step travels as a field so the
 * form that draws it cannot record a different step than the one it labels.
 *
 * Same shape as `anchor-actions.ts`: read the fields, call the real procedure through the server
 * caller (the seat, the scope, the audit event and the RACI notification all happen there), then
 * redirect back to the tab with a notice or the refusal's message key. Nothing is decided here.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { withRefusal } from '@/lib/distributions/paths';
import { withNotice } from '@/lib/endowments/anchor-notices';
import { endowmentPath } from '@/lib/endowments/paths';
import { kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

const STEPS = ['PRINCIPAL_CONSENT', 'COUNSEL_REVIEW', 'AUTHORITY_NOTICE'] as const;
type Step = (typeof STEPS)[number];

function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value);
}

function requireField(value: FormDataEntryValue | null, field: string, max = 128): string {
  if (typeof value !== 'string' || value === '' || value.length > max) {
    throw new Error(`${field} is missing or malformed`);
  }
  return value;
}

function optionalField(value: FormDataEntryValue | null, max = 64): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  if (value.length > max) throw new Error('documentId is malformed');
  return value.trim();
}

export async function recordChainStepAction(formData: FormData): Promise<void> {
  const locale = requireField(formData.get('locale'), 'locale');
  const waqfId = requireField(formData.get('waqfId'), 'waqfId');
  const approvalRequestId = requireField(formData.get('approvalRequestId'), 'approvalRequestId');
  const step = requireField(formData.get('step'), 'step');
  const reference = requireField(formData.get('reference'), 'reference', 256);
  const documentId = optionalField(formData.get('documentId'));
  const destination = endowmentPath(locale, waqfId, 'reserved');

  if (!isStep(step)) {
    redirect(withRefusal(destination, 'errors.generic'));
  }

  let failure: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    const input = {
      waqfId,
      approvalRequestId,
      reference,
      ...(documentId !== undefined ? { documentId } : {}),
    };
    if (step === 'PRINCIPAL_CONSENT') await caller.reservedMatter.recordPrincipalConsent(input);
    else if (step === 'COUNSEL_REVIEW') await caller.reservedMatter.recordCounselReview(input);
    else await caller.reservedMatter.recordAuthorityNotice(input);
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  revalidatePath(destination);
  redirect(
    failure !== null
      ? withRefusal(destination, failure)
      : withNotice(destination, 'chainStepRecorded'),
  );
}
