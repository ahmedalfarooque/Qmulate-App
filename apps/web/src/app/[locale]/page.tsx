import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { AppShell } from '@/components/AppShell';

import type { Metadata } from 'next';

/**
 * `/[locale]` — portfolio scope, no endowment selected.
 *
 * This is the ungated shell: it renders the chrome and nothing else, because there is
 * nothing a caller is entitled to see before they authenticate. It exists as its own route
 * (rather than redirecting straight to `/dashboard`) so the shell — RTL mirroring, the
 * light-source flip, the Arabic label treatment — is verifiable without a database, a
 * session or a seed (AC-E0-3, AC-E0-4).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });
  return { title: t('portfolioScope') };
}

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <header className="flex flex-col gap-[var(--space-4)]">
          <p className="qm-label">{t('portfolioScope')}</p>
          <h1 className="text-h1">{t('appName')}</h1>
        </header>

        <section className="qm-card flex flex-col items-start gap-[var(--space-16)]">
          <h2 className="text-h3">{t('selectEndowment')}</h2>
          {/* No counts, no totals, no sample endowments. Nothing is bound to data yet, and
              a placeholder number on a trustee's dashboard is worse than an empty one. */}
          <Link href={`/${locale}/sign-in`} className="qm-btn qm-btn--primary">
            {t('signIn')}
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
