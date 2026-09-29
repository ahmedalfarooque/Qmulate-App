import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';
import { Eyebrow, Heading, Text } from '@qmulate/ui';

import { AppShell } from '@/components/AppShell';
import { ApprovalQueue } from '@/components/distributions/ApprovalQueue';
import { Refusal } from '@/components/endowments/Refusal';
import { loadApprovalQueue, loadCaller } from '@/lib/distributions/loaders';

import type { Metadata } from 'next';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE NAZIR'S APPROVALS QUEUE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The one cross-endowment screen in this module, and the reason it is allowed to be one: it is about
 * DECISIONS, not about money. Each row's figure belongs to its own endowment and its own deed, and nothing
 * is summed across rows — the distribution screens are per-endowment precisely because a portfolio total of
 * two endowments' distributables is a number with no legal meaning.
 *
 * ⚠ IT COVERS DISTRIBUTION RUNS AND NOTHING ELSE, AND THAT IS A FACT ABOUT THE KERNEL, NOT A SCOPE CHOICE.
 * There is no `approval.list` procedure: the API exposes `approval.get({approvalRequestId})` and nothing that
 * enumerates open requests. So the queue is composed from `distribution.list` per endowment plus one
 * `approval.get` per run that names an approval — which also means a pending `RESERVED_MATTER` or
 * `BANK_MOVEMENT` does NOT appear here. An endowment-scoped `approval.list` is owed to the API layer; it is
 * not inventable in the web app, and a heading implying completeness would be worse than the gap.
 *
 * ── WHO SEES WHAT, AND WHY THE PAGE IS NOT ROLE-GATED ─────────────────────────────────────
 * Every read is `distribution:run:read` / `approval:request:read` through the caller's own scoped client, so
 * the queue narrows itself: a seat with no grant sees nothing, a finance seat sees the runs it raised, the
 * Nazir sees what is waiting on them. There is deliberately no "you are the Nazir" check anywhere on this
 * page — `whoami` reports no role list at all, precisely because `getUserRoleKeys()` unions roles across
 * every grant with no `waqfId`, and a screen rendering a role from it would be one refactor away from a
 * permission check doing the same (MP-12).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('approvals') };
}

export default async function ApprovalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tNav = await getTranslations({ locale, namespace: 'nav' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const [queue, caller] = await Promise.all([loadApprovalQueue(locale), loadCaller(locale)]);

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <header className="flex flex-col gap-[var(--space-4)] text-start">
          <Eyebrow tick>{tCommon('portfolioScope')}</Eyebrow>
          <Heading level={1}>{tNav('approvals')}</Heading>
          <Heading level={2}>{t('approval.queueTitle')}</Heading>
          {/* Maker ≠ checker, stated on the queue itself rather than only enforced under it. */}
          <Text tone="mist">{t('approval.body')}</Text>
        </header>

        {queue.status === 'ok' ? (
          <ApprovalQueue
            locale={locale}
            rows={queue.value}
            caller={caller.status === 'ok' ? caller.value : null}
          />
        ) : (
          <Refusal locale={locale} messageKey={queue.messageKey} />
        )}
      </div>
    </AppShell>
  );
}
