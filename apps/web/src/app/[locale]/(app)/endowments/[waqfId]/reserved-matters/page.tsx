import { getTranslations } from 'next-intl/server';

import { Heading, Text } from '@qmulate/ui';

import { Refusal } from '@/components/endowments/Refusal';
import { ReservedMatterPanel } from '@/components/endowments/ReservedMatterPanel';
import { REFUSAL_PARAM } from '@/lib/distributions/paths';
import { isAnchorNotice } from '@/lib/endowments/anchor-notices';
import { loadReservedMatters } from '@/lib/endowments/loaders';
import { kernelMessageKey } from '@/lib/trpc/client';

import { endowmentScreenContext, EndowmentScreen } from '../screen';

import type { Metadata } from 'next';

/**
 * Reserved matters (BR-306 / BR-1102): an act recorded as reserved, and VISIBLY BLOCKED until the
 * Nazir approves it.
 *
 * ⚠ THIS SCREEN RAISES NOTHING AND APPROVES NOTHING IN S4. Both `reservedMatter.markReserved` and
 * `reservedMatter.approve` exist behind the kernel — the second requires a fresh TOTP step-up,
 * maker != checker against the PERSISTED maker id, and a payload-hash re-check that voids a changed
 * artifact. Driving them from a screen is a maker-checker surface of its own (a diff, a sign-off
 * panel, a step-up dialog), and half of that is worse than none: a Nazir must never approve from a
 * screen that shows less than what they are signing. So S4 ships the READ, where the blocked state
 * is the thing being proven, and the approval surface belongs to the approvals module.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'endowments' });
  return { title: t('reserved.title') };
}

export default async function ReservedMattersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, waqfId } = await params;
  const query = await searchParams;
  const context = await endowmentScreenContext(locale, waqfId);
  const t = await getTranslations({ locale, namespace: 'endowments' });

  // ⊕ S12-2 · the record-step action redirects back here with a notice or a refusal key (the
  // record page's own convention).
  const refusalParam = query[REFUSAL_PARAM];
  const actionRefusal =
    typeof refusalParam === 'string' && refusalParam !== ''
      ? kernelMessageKey({ messageKey: refusalParam }, locale)
      : null;
  const noticeParam = query['notice'];
  const notice =
    isAnchorNotice(noticeParam) && noticeParam === 'chainStepRecorded' ? noticeParam : null;
  const matters =
    context.endowment.status === 'ok' ? await loadReservedMatters(locale, waqfId) : null;

  return (
    <EndowmentScreen locale={locale} waqfId={waqfId} active="reserved" context={context}>
      {matters === null ? null : (
        <div className="flex flex-col gap-[var(--space-16)]">
          <header className="flex flex-col gap-[var(--space-4)] text-start">
            <Heading level={2}>{t('reserved.title')}</Heading>
            <Text tone="mist">{t('reserved.intro')}</Text>
          </header>

          {actionRefusal !== null ? <Refusal locale={locale} messageKey={actionRefusal} /> : null}
          {notice !== null ? (
            <div role="status" data-testid="qm-reserved-notice" data-notice={notice}>
              <Text tone="mist">{t('reserved.stepSaved')}</Text>
            </div>
          ) : null}

          {matters.status === 'ok' ? (
            <ReservedMatterPanel locale={locale} matters={matters.value} />
          ) : (
            <Refusal locale={locale} messageKey={matters.messageKey} />
          )}
        </div>
      )}
    </EndowmentScreen>
  );
}
