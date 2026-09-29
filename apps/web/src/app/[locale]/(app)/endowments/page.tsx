import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';
import { Eyebrow, Heading, Text } from '@qmulate/ui';

import { AppShell } from '@/components/AppShell';
import { EndowmentTree } from '@/components/endowments/EndowmentTree';
import { Refusal } from '@/components/endowments/Refusal';
import { loadNavigationTree } from '@/lib/endowments/loaders';

import type { Metadata } from 'next';

/**
 * The endowment index — Client → Waqif → Endowment (BR-102).
 *
 * ── THE GATE IS REPEATED HERE, AND THAT IS THE HOUSE RULE ─────────────────────────────────
 * `(app)/layout.tsx` runs the same two redirects. A LAYOUT ALONE IS NOT A GATE: Next.js does not
 * re-run a layout on a client-side navigation within the same segment, so a page reached by `<Link>`
 * would render on a decision taken on some earlier request. A PAGE alone is not a gate either,
 * because the next person adding a screen under `(app)/` will forget. Two layers, one source of
 * truth (`evaluateAuthGate`), and the TOTP enrolment gate is universal — never role-conditional.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('endowments') };
}

export default async function EndowmentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const tree = await loadNavigationTree(locale);

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <header className="flex flex-col gap-[var(--space-4)] text-start">
          <Eyebrow tick>{tCommon('portfolioScope')}</Eyebrow>
          <Heading level={1}>{t('title')}</Heading>
          <Text tone="mist">{t('intro')}</Text>
        </header>

        {tree.status === 'ok' ? (
          <EndowmentTree locale={locale} tree={tree.value} />
        ) : (
          <Refusal locale={locale} messageKey={tree.messageKey} />
        )}
      </div>
    </AppShell>
  );
}
