import { NextIntlClientProvider } from 'next-intl';
import { getMessages as getIntlMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { defaultTimeZone, getDirection, locales } from '@qmulate/i18n';

import type { Locale } from '@qmulate/i18n';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '../globals.css';

/* ─────────────────────────────────────────────────
 * Typefaces — self-hosted through `@fontsource` (Option A, decided S11 2026-09-02), imported
 * in `globals.css`; no runtime request to a third-party CDN (NFR-03 residency). Until S11 this
 * file bound the four delivered brand TTFs through `next/font/local` — 400/700 only, so
 * Display 300, H3 500, H1/H2 600 and the mono label 500 rendered synthetic or snapped — and
 * re-pointed the tokens to the hashed families, leaving `'Outfit Variable'` in tokens.css a
 * dead word. The variable faces fill every weight; the tokens' own stack is the stack.
 * ───────────────────────────────────────────────── */

/**
 * No `generateStaticParams` here yet. Static locale rendering requires next-intl's
 * `setRequestLocale` in every server component beneath this layout; half of that pattern
 * is worse than none, and E0's surfaces are session-gated (therefore dynamic) anyway.
 * It is a build-time optimisation to revisit once the screens exist.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });

  return {
    title: { default: t('appName'), template: `%s · ${t('appName')}` },
    // No description, no OG image, no address: the HQ city (Riyadh vs Jeddah) is an OPEN
    // question (16-open-questions.md Q3) and nothing in E0 may bake a city string.
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(locales as readonly string[]).includes(locale)) notFound();

  const typedLocale = locale as Locale;
  const dir = getDirection(typedLocale);
  const messages = await getIntlMessages();

  return (
    // `dir` on the root element is what flips the neumorphic light source: tokens.css
    // scopes `--nu-dir: -1` to `:root[dir="rtl"]`, so a nested dir="ltr" island (an IBAN or
    // deed-number input inside an Arabic form) keeps the page's light source instead of
    // inverting its own shadows.
    <html lang={typedLocale} dir={dir}>
      <body className="min-h-[100dvh] bg-bg text-ink antialiased">
        <NextIntlClientProvider locale={typedLocale} messages={messages} timeZone={defaultTimeZone}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
