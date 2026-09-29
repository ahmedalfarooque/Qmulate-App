import { getTranslations } from 'next-intl/server';

import { Card, Heading, Text } from '@qmulate/ui';

/**
 * Refusal — the one honest sentence when a read does not return a record.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * IT RENDERS NO MACHINE CODE, AND CARRIES NO `data-*` ATTRIBUTE NAMING ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `NO_GRANT`, `SCOPE_REF_MISMATCH` and `AML_COMPARTMENT_ONLY` are all tRPC `NOT_FOUND` and share
 * ONE byte-identical wording in both locales — asserted by `packages/i18n/test/messages.test.ts` —
 * precisely so the caller cannot tell which of the three happened (§10 §6/§7.2: the endowment's
 * EXISTENCE is not disclosed, and the AML compartment behaves as an empty set even to its subject).
 *
 * A distinguishing attribute in the HTML would re-disclose that to anyone reading the DOM, and no
 * status-code test would notice. That is why `@/lib/trpc/client` deliberately ships no
 * `kernelErrorCode()` helper and this component takes only a validated message KEY: the key has
 * already been checked against both error namespaces and degrades to `errors.generic` for anything
 * unrecognised, so a renamed code cannot print `errors.access.WHATEVER` on a Nazir's screen.
 *
 * The machine code belongs in the audit trail, which `@qmulate/api` writes server-side, and in the
 * operator log line. Not here.
 */
export async function Refusal({
  locale,
  messageKey,
  title,
}: {
  readonly locale: string;
  /** Already validated by `kernelMessageKey` — `errors.access.*`, `errors.domain.*`, or generic. */
  readonly messageKey: string;
  /** Optional heading. Defaults to the non-disclosure title, which says nothing specific. */
  readonly title?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'errors' });

  // `namespace: 'errors'` is already scoped, so the leaf is what `t()` wants. An unexpected shape
  // falls back to the generic sentence rather than to a raw key.
  const leaf = messageKey.startsWith('errors.') ? messageKey.slice('errors.'.length) : 'generic';

  return (
    <Card as="section" className="flex flex-col gap-[var(--space-8)] text-start" role="alert">
      <Heading level={3}>{title ?? t('notAuthorized')}</Heading>
      <Text tone="mist">{t(leaf)}</Text>
    </Card>
  );
}
