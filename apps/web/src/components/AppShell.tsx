import { getTranslations } from 'next-intl/server';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

import type { ReactNode } from 'react';

/**
 * The application chrome: glass topbar + mirrored sidebar + the main content column.
 *
 * A server component on purpose — the shell itself needs no interactivity, so only the
 * two genuinely stateful strips (`Topbar`, `Sidebar`) cross into the client bundle.
 *
 * Layout is authored entirely in LOGICAL properties, so `dir="rtl"` on the root mirrors it
 * with no second stylesheet and no conditional class. Height is `min-h-[100dvh]`, never a
 * viewport-height utility: mobile browser chrome makes `100vh` taller than the viewport.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const t = await getTranslations('common');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg text-ink">
      <a href="#qm-main" className="qm-skip-link qm-label text-ink">
        {t('skipToContent')}
      </a>

      <Topbar />

      <div className="mx-auto flex w-full max-w-product flex-1 flex-col gap-[var(--space-16)] px-[var(--space-16)] py-[var(--space-24)] md:flex-row md:gap-[var(--space-24)]">
        <Sidebar />

        <main id="qm-main" tabIndex={-1} className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
