'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { locales } from '@qmulate/i18n';

import type { Locale } from '@qmulate/i18n';

/** Replace the locale segment, preserving the rest of the path. */
function withLocale(pathname: string, next: Locale): string {
  const segments = pathname.split('/');
  if ((locales as readonly string[]).includes(segments[1] ?? '')) {
    segments[1] = next;
    return segments.join('/') || `/${next}`;
  }
  return `/${next}${pathname === '/' ? '' : pathname}`;
}

/**
 * The language toggle — a two-state segmented control, not a dropdown: with exactly two
 * locales a select costs an extra interaction and hides the alternative.
 *
 * The selected side reads as an inset well, but the *information* is carried by
 * `aria-pressed`, the accent colour and the `--color-edge` boundary — never by the shadow
 * alone (DESIGN.md §0: neumorphism carries the feeling, never the information).
 */
export function LocaleSwitch() {
  const t = useTranslations('common');
  const activeLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const labels: Record<Locale, string> = {
    ar: t('languageAr'),
    en: t('languageEn'),
  };

  return (
    <div
      role="group"
      aria-label={t('language')}
      className="inline-flex items-center gap-[var(--space-4)] rounded-pill border border-edge bg-panel p-[var(--space-4)] shadow-raised-sm"
    >
      {locales.map((locale) => {
        const isActive = locale === activeLocale;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={isActive}
            disabled={isPending}
            onClick={() => {
              if (isActive) return;
              startTransition(() => router.replace(withLocale(pathname, locale)));
            }}
            className={[
              'min-h-tap rounded-pill px-[var(--space-16)] text-body-sm',
              'transition duration-fast focus-visible:shadow-focus',
              isActive
                ? 'bg-well text-blue-strong shadow-inset'
                : 'text-mist hover:text-ink active:shadow-inset',
            ].join(' ')}
          >
            {labels[locale]}
          </button>
        );
      })}
    </div>
  );
}
