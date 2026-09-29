import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';
import { Eyebrow, Heading, Mono, Text } from '@qmulate/ui';

import { AppShell } from '@/components/AppShell';
import { RunList } from '@/components/distributions/RunList';
import { Refusal } from '@/components/endowments/Refusal';
import { holds, loadCaller, loadRunList } from '@/lib/distributions/loaders';
import { newRunPath } from '@/lib/distributions/paths';

import type { Metadata } from 'next';

/**
 * One endowment's distribution runs, and the entry to the wizard.
 *
 * ⚠ THE "COMPUTE A DISTRIBUTION" LINK IS OFFERED ONLY TO A CALLER HOLDING `distribution:run:read`, AND THAT
 * IS A COURTESY, NOT THE GATE. The wizard's own read is `distribution.preview`, which requires that
 * permission and is refused without it from the caller's own scoped client. Note which seat is deliberately
 * NOT offered it: `ROLE_PRESETS.nazir` holds `distribution:run:read` and so does see the wizard, but holds
 * neither `run:write` nor `run:initiate` — the Nazir may LOOK at what a period computes to and may not
 * create or submit it, because the Nazir is the checker on money movement and must never be its maker.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'distribution' });
  return { title: t('title') };
}

export default async function EndowmentRunsPage({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}) {
  const { locale, waqfId } = await params;

  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  // Independent reads: a refusal on `whoami` must not blank the run list, and a refusal on the run list
  // must not hide the caller's own facts. Neither is the other's precondition.
  const [runs, caller] = await Promise.all([loadRunList(locale, waqfId), loadCaller(locale)]);
  const callerFacts = caller.status === 'ok' ? caller.value : null;

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <header className="flex flex-col gap-[var(--space-8)] text-start">
          <Eyebrow tick>{tCommon('endowment')}</Eyebrow>
          <div className="flex flex-wrap items-baseline gap-[var(--space-12)]">
            <Heading level={1}>{t('title')}</Heading>
            <Mono tone="mist">{waqfId}</Mono>
          </div>
          <Text tone="mist">{t('intro')}</Text>

          {holds(callerFacts, waqfId, 'distribution:run:read') ? (
            <Link
              href={newRunPath(locale, waqfId)}
              className="qm-label w-fit rounded-control border border-blue-strong px-[var(--space-16)] py-[var(--space-8)] text-blue-strong focus-visible:shadow-focus hover:bg-blue-tint"
              data-testid="qm-new-run"
            >
              {t('newRun')}
            </Link>
          ) : null}
        </header>

        {runs.status === 'ok' ? (
          <RunList locale={locale} waqfId={waqfId} runs={runs.value} />
        ) : (
          <Refusal locale={locale} messageKey={runs.messageKey} />
        )}
      </div>
    </AppShell>
  );
}
