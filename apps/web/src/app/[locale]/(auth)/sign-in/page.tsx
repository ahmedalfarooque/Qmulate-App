import { getTranslations } from 'next-intl/server';

import { LocaleSwitch } from '@/components/LocaleSwitch';
import { SignInForm } from '@/components/SignInForm';

import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('signInTitle') };
}

/**
 * Sign-in sits OUTSIDE the AppShell: there is no navigation to offer someone who has not
 * authenticated, and rendering the sidebar here would leak the product's surface area
 * before the access matrix has had a say.
 */
export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
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
        <h1 className="mb-[var(--space-20)] text-h2">{t('signInTitle')}</h1>
        <SignInForm />
      </section>
    </main>
  );
}
