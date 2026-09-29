import { getTranslations } from 'next-intl/server';

import { Text } from '@qmulate/ui';

import { EndowmentRecord } from '@/components/endowments/EndowmentRecord';
import { ExpropriationsPanel } from '@/components/endowments/ExpropriationsPanel';
import { Refusal } from '@/components/endowments/Refusal';
import { RegistrationAnchorPanel } from '@/components/endowments/RegistrationAnchorPanel';
import { REFUSAL_PARAM } from '@/lib/distributions/paths';
import { isAnchorNotice, type AnchorNotice } from '@/lib/endowments/anchor-notices';
import {
  loadClientName,
  loadExpropriations,
  loadRegistrationDeadline,
} from '@/lib/endowments/loaders';
import { kernelMessageKey } from '@/lib/trpc/client';

import { endowmentScreenContext, EndowmentScreen, partyName } from './screen';

import type { Metadata } from 'next';

/**
 * AC-E3-01 — every BR-101 element of the endowment record, on one screen, in one payload:
 * the family and the founder, the certificate and deed numbers, the Authority classification, the
 * type and nature, the registration date in BOTH calendars, the certificate's validity, and the
 * Nazir assignment.
 *
 * A caller with no grant on this endowment reaches the same URL and is told the record was not
 * found — never that they lack permission, which would disclose that it exists.
 */
export const dynamic = 'force-dynamic';

/** ⊕ S11-1 — each anchor-action outcome → its catalogue sentence. Closed on both sides. */
const NOTICE_KEY = {
  anchorSaved: 'anchor.saved',
  anchorSavedNotComputable: 'anchor.savedNotComputable',
  anchorCleared: 'anchor.cleared',
  istibdalSaved: 'expropriations.saved',
  istibdalSavedNotComputable: 'expropriations.savedNotComputable',
  istibdalCleared: 'expropriations.cleared',
  // ⊕ S11-2 — the discharge outcomes; the four refusals are rendered in the warning tone below.
  dischargeSaved: 'discharge.saved',
  dischargeRefusedAlready: 'discharge.refusedAlready',
  dischargeRefusedNoDeadline: 'discharge.refusedNoDeadline',
  dischargeRefusedPrecedes: 'discharge.refusedPrecedes',
  dischargeRefusedFuture: 'discharge.refusedFuture',
  chainStepRecorded: 'reserved.stepSaved',
  gateCleared: 'onboarding.cleared',
  gateReopened: 'onboarding.reopened',
  intaken: 'onboarding.intaken',
} as const satisfies Record<AnchorNotice, string>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'endowments' });
  return { title: t('record.title') };
}

export default async function EndowmentRecordPage({
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

  /**
   * ⊕ S11-1 — the two params the anchor actions carry back. Both RE-VALIDATED here, never trusted
   * because an action wrote them (they are URL params; anybody can type one): the refusal through
   * `kernelMessageKey` (prefix, code shape, catalogue existence — degrading to `errors.generic`), the
   * notice against the closed `ANCHOR_NOTICES` set (anything else is dropped).
   */
  const refusalParam = query[REFUSAL_PARAM];
  const actionRefusal =
    typeof refusalParam === 'string' && refusalParam !== ''
      ? kernelMessageKey({ messageKey: refusalParam }, locale)
      : null;
  const noticeParam = query['notice'];
  const notice = isAnchorNotice(noticeParam) ? noticeParam : null;

  // The takings are loaded only when the record itself is readable — same reason the client name is.
  const expropriations =
    context.endowment.status === 'ok' ? await loadExpropriations(locale, waqfId) : null;
  // ⊕ S11-2 — the REGISTER_30BD head, under its own read verb; a refusal stays a refusal (see the panel).
  const registrationDeadline =
    context.endowment.status === 'ok' ? await loadRegistrationDeadline(locale, waqfId) : null;

  // The family name needs the endowment's `clientId`, so it is read here rather than in the shared
  // context — the four other tabs do not show it and should not pay for the query.
  const client =
    context.endowment.status === 'ok'
      ? await loadClientName(locale, context.endowment.value.clientId)
      : null;
  const clientName =
    client !== null && client.status === 'ok' ? partyName(locale, client.value) : null;

  return (
    <EndowmentScreen locale={locale} waqfId={waqfId} active="record" context={context}>
      {context.endowment.status === 'ok' ? (
        <div className="flex flex-col gap-[var(--space-24)]">
          {/* A refusal carried back from an anchor action — first thing read, same choke point. */}
          {actionRefusal !== null ? <Refusal locale={locale} messageKey={actionRefusal} /> : null}
          {notice !== null ? (
            // "Recorded — not computable" is its own tone: a warning, never the green of "saved".
            <div role="status" data-testid="qm-anchor-notice" data-notice={notice}>
              <Text
                tone={
                  notice.endsWith('NotComputable') || notice.startsWith('dischargeRefused')
                    ? 'warning'
                    : 'success'
                }
              >
                {t(NOTICE_KEY[notice])}
              </Text>
            </div>
          ) : null}
          <EndowmentRecord
            locale={locale}
            endowment={context.endowment.value}
            clientName={clientName}
            waqifName={partyName(locale, context.waqifName)}
          />
          <RegistrationAnchorPanel
            locale={locale}
            endowment={context.endowment.value}
            deadline={registrationDeadline ?? { status: 'refused', messageKey: 'errors.generic' }}
          />
          {expropriations === null ? null : (
            <ExpropriationsPanel
              locale={locale}
              waqfId={waqfId}
              expropriations={expropriations}
              writable={context.endowment.value.writable.istibdalCompletion}
            />
          )}
        </div>
      ) : null}
    </EndowmentScreen>
  );
}
