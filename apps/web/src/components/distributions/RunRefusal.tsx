import { getTranslations } from 'next-intl/server';

import { Card, Heading, Text } from '@qmulate/ui';

import { DiagnosticCode } from '@/components/endowments/DiagnosticCode';

import type { RunRefusalView } from '@/lib/distributions/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A HALT — ONE CATALOGUED SENTENCE, PLUS THE DISCRIMINATOR AS A MACHINE CODE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * When the founder's conditions cannot resolve entitlement or shares, the engine HALTS and returns
 * `SHART_INCOMPLETE`. It never guesses, never defaults, and never infers the founder's intent —
 * resolution goes to the condition-interpretation path, never to code (binding rule 1).
 *
 * This component is the rendering of that, and it copies `ShartPanel`'s shape exactly:
 *
 *   · **The sentence** comes from the catalogue, via the `messageKey` the error itself declared, already
 *     validated against both error namespaces by `kernelMessageKey`. `errors.domain.SHART_INCOMPLETE` in
 *     Arabic reads «شرط الواقف غير مكتمل أو غير واضح، فتوقّف الاحتساب. لا يُقدَّر شيء بالتخمين؛ يجب
 *     استيضاح الشرط أولًا.» — approved copy, not invented here.
 *   · **The discriminator** is the ONE field that tells the twenty-six `SHART_REFUSALS` apart, and it has
 *     no approved wording in any locale. It renders as a machine code. Writing twenty-six plausible
 *     sentences would put unapproved legal wording in front of a beneficiary AND look finished while
 *     doing it — which is strictly worse than a code an operator can quote in a ticket.
 *
 * ── THE TWO SOURCES ARE DIFFERENT ANSWERS AND ARE LABELLED DIFFERENTLY ────────────────────
 * `refusalSource: 'engine'` means the founder's conditions themselves are the obstacle — a condition to be
 * CLARIFIED, and the answer is with the living waqif or the competent authority, never with an operator.
 * `refusalSource: 'mapper'` means the RECORD is the obstacle: a state the engine's input cannot express,
 * and the remedy is completing an entry. Collapsing the two would send a Nazir to fix a database row when
 * the real question is one of fiqh, or to counsel when the real answer is a missing column.
 *
 * ⚠ `refusal: null` MEANS THE ERROR CARRIED NO RECOGNISED DISCRIMINATOR. The panel then shows the
 * sentence alone. It is never inferred, never parsed out of the message, never replaced with a likely
 * candidate.
 *
 * ⚠ `details` IS NOT RENDERED AND DOES NOT REACH THIS COMPONENT. It is dropped at the loader boundary.
 */
export async function RunRefusal({
  locale,
  refusal,
}: {
  readonly locale: string;
  readonly refusal: RunRefusalView;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tErrors = await getTranslations({ locale, namespace: 'errors' });

  // Already validated: `errors.access.*`, `errors.domain.*`, or the generic fallback. A shape this
  // function does not recognise degrades to the generic sentence rather than to a raw key.
  const leaf = refusal.messageKey.startsWith('errors.')
    ? refusal.messageKey.slice('errors.'.length)
    : 'generic';

  return (
    <Card
      as="section"
      role="alert"
      className="flex flex-col gap-[var(--space-16)] text-start"
      data-testid="qm-run-refusal"
    >
      <div className="flex flex-col gap-[var(--space-8)]">
        <Heading level={2}>{t('refusal.title')}</Heading>
        <Text>{tErrors(leaf)}</Text>
        <Text tone="mist">{t('refusal.nothingComputed')}</Text>
      </div>

      {refusal.refusalSource === null ? null : (
        <Text variant="body-sm" tone="mist" data-testid="qm-refusal-source">
          {refusal.refusalSource === 'mapper'
            ? t('refusal.sourceMapper')
            : t('refusal.sourceEngine')}
        </Text>
      )}

      {refusal.refusal === null ? null : (
        <div className="flex flex-col gap-[var(--space-8)]">
          <Heading level={3}>{t('refusal.discriminatorTitle')}</Heading>
          <div data-testid="qm-refusal-discriminator" data-refusal={refusal.refusal}>
            <DiagnosticCode locale={locale} code={refusal.refusal} />
          </div>
        </div>
      )}
    </Card>
  );
}
