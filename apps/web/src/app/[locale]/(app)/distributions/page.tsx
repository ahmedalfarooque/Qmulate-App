import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';
import { Card, Eyebrow, Heading, Mono, Text } from '@qmulate/ui';

import { AppShell } from '@/components/AppShell';
import { Chip } from '@/components/endowments/Chip';
import { CLASSIFICATION_TONE } from '@/components/endowments/EndowmentHeader';
import { Refusal } from '@/components/endowments/Refusal';
import { UnverifiedMark } from '@/components/endowments/UnverifiedMark';
import { vocabText } from '@/components/endowments/VocabLabel';
import { holds, loadCaller, loadEndowmentRefs } from '@/lib/distributions/loaders';
import { endowmentRunsPath } from '@/lib/distributions/paths';

import type { EndowmentRef } from '@/lib/distributions/types';
import type { Metadata } from 'next';

/**
 * The distribution index — pick an endowment, because a run is always about ONE endowment.
 *
 * ⚠ THERE IS NO PORTFOLIO-WIDE DISTRIBUTION VIEW HERE, AND THERE SHOULD NOT BE. Every distribution
 * procedure is endowment-scoped: `distribution.list` takes a `waqfId`, the caller's ACTIVE grant for that
 * endowment is resolved, and the permission is asserted against it. An aggregate list would have to fan out
 * across endowments and would present as one table figures whose deeds, waterfalls and entitlement orders
 * are different documents. The Nazir's cross-endowment view is the APPROVALS queue, which is about
 * decisions rather than about money.
 *
 * ── THE GATE IS REPEATED HERE, AND THAT IS THE HOUSE RULE ─────────────────────────────────
 * `(app)/layout.tsx` runs the same two redirects. A LAYOUT ALONE IS NOT A GATE: Next.js does not re-run a
 * layout on a client-side navigation within the same segment, so a page reached by `<Link>` would render on
 * a decision taken on some earlier request. A page alone is not a gate either, because the next person
 * adding a screen under `(app)/` will forget. Two layers, one source of truth, and the TOTP enrolment gate
 * is universal — never role-conditional.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('distributions') };
}

export default async function DistributionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const [refs, caller] = await Promise.all([loadEndowmentRefs(locale), loadCaller(locale)]);
  const callerFacts = caller.status === 'ok' ? caller.value : null;

  /**
   * ⚠ A COURTESY FILTER, NEVER THE GATE. Every per-endowment read below refuses on its own from the
   * caller's own scoped client. This only avoids offering a link to a screen that is certain to refuse:
   * a grant may carry `finance:*` and no `distribution:run:read`, and an endowment listed here that
   * answers NOT FOUND on click teaches the user the product is broken.
   */
  const visible =
    refs.status === 'ok'
      ? refs.value.filter((ref) => holds(callerFacts, ref.waqfId, 'distribution:run:read'))
      : [];

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <header className="flex flex-col gap-[var(--space-4)] text-start">
          <Eyebrow tick>{tCommon('portfolioScope')}</Eyebrow>
          <Heading level={1}>{t('title')}</Heading>
          {/* Binding rule 1, stated on the first screen of the module rather than only in the code:
              only ghallah (income) is distributed, the corpus enters no figure, and the two are never
              added together. */}
          <Text tone="mist">{t('intro')}</Text>
        </header>

        {refs.status !== 'ok' ? (
          <Refusal locale={locale} messageKey={refs.messageKey} />
        ) : visible.length === 0 ? (
          <Card as="section" className="flex flex-col gap-[var(--space-8)] text-start">
            <Heading level={2}>{tCommon('selectEndowment')}</Heading>
            {/* An empty tree is what a caller with no ACTIVE grant sees. It is not an error and is not
                announced as one: absence of a grant reads as NOT FOUND, never as FORBIDDEN. */}
            <Text tone="mist">{t('emptyBody')}</Text>
          </Card>
        ) : (
          <ul
            className="flex flex-col gap-[var(--space-12)]"
            data-testid="qm-distribution-endowments"
          >
            {visible.map((ref) => (
              <EndowmentCard key={ref.waqfId} locale={locale} ref_={ref} />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

/**
 * One endowment, as its own `async` server component.
 *
 * The house pattern (`BeneficiaryPanel`'s `BeneficiaryTr`): the classification chip's label resolves through
 * an async catalogue lookup, and `await` cannot live inside a `.map` callback.
 *
 * ⚠ THE PROP IS `ref_`, NOT `ref`. `ref` is reserved on a React element and would be swallowed rather than
 * passed — a silent `undefined` inside the component, not a build error.
 */
async function EndowmentCard({
  locale,
  ref_,
}: {
  readonly locale: string;
  readonly ref_: EndowmentRef;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <li>
      <Card
        as="article"
        className="flex flex-col gap-[var(--space-12)] text-start"
        data-testid="qm-distribution-endowment"
        data-waqf-id={ref_.waqfId}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-12)]">
          <div className="flex flex-col gap-[var(--space-4)]">
            <span className="qm-label">{tCommon('endowment')}</span>
            {/* An LTR island: a certificate number placed next to Arabic text reorders itself without
                the isolate, and the number read off the screen stops being the number in the deed. */}
            {ref_.certificateNumber === null ? (
              <Mono size="body-sm">{ref_.waqfId}</Mono>
            ) : (
              <Mono>{ref_.certificateNumber}</Mono>
            )}
          </div>
          {/* ⚠ A CLASSIFICATION IS SHOWN ONLY WHERE ONE WAS READ. It reaches this app through
              `navigation.tree`, which a maker seat may not be able to read at all (measured: the
              `FINANCE` seat gets an empty tree while holding five ACTIVE grants). A default band would
              be a fabricated compliance fact — it gates real regulatory obligations — so an unread
              classification renders as nothing rather than as a guess. */}
          {ref_.classification === null ? null : (
            <div className="flex flex-col items-start gap-[var(--space-4)]">
              <Chip
                tone={CLASSIFICATION_TONE[ref_.classification] ?? 'neutral'}
                label={await vocabText(locale, 'classification', ref_.classification)}
              />
              {/* ⚠ The SAR 200M / 50M bands behind a classification are UNVERIFIED against primary law. */}
              <UnverifiedMark locale={locale} />
            </div>
          )}
        </div>

        <Link
          href={endowmentRunsPath(locale, ref_.waqfId)}
          className="qm-label text-blue-strong underline-offset-4 hover:underline focus-visible:shadow-focus"
          data-testid="qm-endowment-runs-link"
        >
          {t('title')}
        </Link>
      </Card>
    </li>
  );
}
