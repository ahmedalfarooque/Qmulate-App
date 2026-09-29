'use server';

/**
 * ⊕ S12-3b · the intake form's ONE write: REGISTER an endowment through the real procedure
 * (`onboarding.intake`). Same shape as the other server actions: read the fields, call the kernel
 * through the server caller, redirect back to the intake screen — with the notice and the newborn's id
 * on success, with the refusal's message key otherwise.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { withRefusal } from '@/lib/distributions/paths';
import { withNotice } from '@/lib/endowments/anchor-notices';
import { kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

const TYPES = ['PUBLIC_CHARITABLE', 'FAMILY_DHURRI'] as const;
const NATURES = ['AYNI', 'QIYAMI'] as const;
const ORDERS = ['LINEAGE_CONTINUATION', 'ORDERED', 'SHARED', 'NA_DIRECT_USE'] as const;

function oneOf<const T extends readonly string[]>(value: string, values: T): T[number] | null {
  return (values as readonly string[]).includes(value) ? (value as T[number]) : null;
}

function text(formData: FormData, field: string, max = 256): string {
  const value = formData.get(field);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function checked(formData: FormData, field: string): boolean {
  const value = formData.get(field);
  return value === 'on' || value === 'true';
}

export async function intakeEndowmentAction(formData: FormData): Promise<void> {
  const locale = text(formData, 'locale', 8) || 'ar';
  const back = `/${locale}/onboarding`;

  const type = oneOf(text(formData, 'type'), TYPES);
  const nature = oneOf(text(formData, 'nature'), NATURES);
  const entitlementOrder = oneOf(text(formData, 'entitlementOrder'), ORDERS);
  if (type === null || nature === null || entitlementOrder === null) {
    redirect(withRefusal(back, 'errors.generic'));
  }

  const waqifMode = text(formData, 'waqifMode', 16);
  const waqif =
    waqifMode === 'new'
      ? {
          nameAr: text(formData, 'waqifNameAr'),
          nameEn: text(formData, 'waqifNameEn') || null,
        }
      : { existingId: text(formData, 'waqifId', 64) };

  let failure: string | null = null;
  let waqfId: string | null = null;
  try {
    const caller = await getServerCaller(locale);
    const result = await caller.onboarding.intake({
      clientId: text(formData, 'clientId', 64),
      waqif,
      certificateNumber: text(formData, 'certificateNumber', 128),
      deedNumber: text(formData, 'deedNumber', 128),
      type,
      nature,
      entitlementOrder,
      shartNarrativeAr: text(formData, 'shartNarrativeAr', 8000),
      fiscalYearEnd: text(formData, 'fiscalYearEnd', 5),
      registrationDate: text(formData, 'registrationDate', 10),
      trusteeship: {
        primaryNazir: text(formData, 'primaryNazir'),
        primaryAppointedDate: text(formData, 'primaryAppointedDate', 10),
        jointlyLiable: checked(formData, 'jointlyLiable'),
        islam: checked(formData, 'islam'),
        legalCapacity: checked(formData, 'legalCapacity'),
        noDisqualifyingRemoval: checked(formData, 'noDisqualifyingRemoval'),
        ksaResident: checked(formData, 'ksaResident'),
      },
      nazirEmail: text(formData, 'nazirEmail'),
    });
    waqfId = result.waqfId;
  } catch (error) {
    failure = kernelMessageKey(error, locale);
  }

  if (failure !== null || waqfId === null) {
    redirect(withRefusal(back, failure ?? 'errors.generic'));
  }
  revalidatePath(`/${locale}/endowments`);
  revalidatePath(`/${locale}/dashboard`);
  // Back to THIS screen, not the newborn's: the registrar holds no seat on it (self-issue is refused),
  // so its onboarding tab would answer NOT FOUND. The id travels with the notice.
  redirect(`${withNotice(back, 'intaken')}&waqfId=${encodeURIComponent(waqfId)}`);
}
