import { getTranslations } from 'next-intl/server';

import { LocaleSwitch } from '@/components/LocaleSwitch';
import { TwoFactorForm } from '@/components/TwoFactorForm';

import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('totpTitle') };
}

/**
 * The second factor — challenge and enrolment on one route (the form picks the phase from
 * session state). Deliberately NOT server-gated: at challenge time there is no session
 * yet, only better-auth's pending-2FA cookie, so a session check here would bounce the
 * user back to sign-in in a loop.
 */
export default async function TwoFactorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-[var(--space-24)] bg-bg p-[var(--space-24)] text-ink">
      <div className="flex w-full max-w-[30rem] items-center justify-between">
        <span dir="ltr" className="text-h3 font-semibold tracking-[-0.02em]">
          {tCommon('appName')}
        </span>
        <LocaleSwitch />
      </div>

      <section className="qm-card w-full max-w-[30rem]">
        <h1 className="mb-[var(--space-20)] text-h2">{t('totpTitle')}</h1>
        <TwoFactorForm />
      </section>
    </main>
  );
}
