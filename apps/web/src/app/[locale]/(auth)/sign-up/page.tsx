import { getTranslations } from 'next-intl/server';

import { LocaleSwitch } from '@/components/LocaleSwitch';
import { SignUpForm } from '@/components/SignUpForm';

import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  // This is the account-creation page; `totpEnrolTitle` belongs to `/two-factor`.
  return { title: t('createAccount') };
}

/**
 * Account creation — the E0 bootstrap for a seeded internal seat, not open self-service.
 * An account with no `WaqfAccessGrant` can read nothing; the grant is issued by an `admin`
 * through the access matrix, which is a separate, audited action.
 */
export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-[var(--space-24)] bg-bg p-[var(--space-24)] text-ink">
      <div className="flex w-full max-w-[26rem] items-center justify-between">
        <span dir="ltr" className="text-h3 font-semibold tracking-[-0.02em]">
          {tCommon('appName')}
        </span>
        <LocaleSwitch />
      </div>

      <section className="qm-card w-full max-w-[26rem]">
        <h1 className="mb-[var(--space-20)] text-h2">{t('createAccount')}</h1>
        <p className="mb-[var(--space-16)] text-body-sm text-mist">{t('totpEnrolRequired')}</p>
        <SignUpForm />
      </section>
    </main>
  );
}
