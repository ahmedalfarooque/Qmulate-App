import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { LocaleSwitch } from '@/components/LocaleSwitch';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';

import type { Metadata } from 'next';

const TITLE = { ar: 'كلمة مرور جديدة', en: 'Choose a new password' } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: TITLE[locale === 'ar' ? 'ar' : 'en'] };
}

/** Outside the AppShell like sign-in: no navigation is offered to someone who is not authenticated. */
export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-[var(--space-24)] bg-bg p-[var(--space-24)] text-ink">
      <div className="flex w-full max-w-[26rem] items-center justify-between">
        <span dir="ltr" className="text-h3 font-semibold tracking-[-0.02em]">{tCommon('appName')}</span>
        <LocaleSwitch />
      </div>

      <section className="qm-card w-full max-w-[26rem]">
        <h1 className="mb-[var(--space-20)] text-h2">{TITLE[locale === 'ar' ? 'ar' : 'en']}</h1>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </section>
    </main>
  );
}
