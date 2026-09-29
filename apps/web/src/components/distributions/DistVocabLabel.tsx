import { getTranslations } from 'next-intl/server';

import { DiagnosticCode } from '@/components/endowments/DiagnosticCode';
import { distVocabKey, isKnownDistVocab, type DistVocabName } from '@/lib/distributions/labels';

/**
 * A distribution code, rendered as its ar/en label — or as an untranslated machine code when the
 * catalogue has no entry for it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE SAME COMPONENT AS `endowments/VocabLabel`, POINTED AT THE `distribution` NAMESPACE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * It exists for the same reason: next-intl DOES NOT THROW FOR A MISSING MESSAGE — IT PRINTS THE KEY. A
 * bare `t(\`flag.${value}\`)` on an unexpected value renders `distribution.flag.WHATEVER` on a Nazir's
 * screen and no suite goes red — the catalogue parity test only compares ar against en, and the static
 * key scan cannot follow a key built at runtime.
 *
 * `packages/api` sends every domain enum across the wire as a `string` so the transport does not import
 * the domain's vocabulary. The wire type is therefore WIDER than the domain, and a screen must check
 * rather than assume. `DIST_VOCAB` is that check, and the i18n suite pins each group member-for-member
 * against the engine contract in both locales and in both directions, so the translated branch cannot
 * silently lose an entry either.
 *
 * ⚠ IT NEVER GUESSES AND IT NEVER HIDES. An unrecognised value is shown, as itself, in mono — a visible
 * gap an operator can quote in a ticket. An em-dash or "unknown" would erase a fact the engine is
 * asserting about a legal computation.
 *
 * ⚠ WHAT MUST NOT COME THROUGH HERE. The eight exclusion-reason codes, the seven entitlement rules and
 * the twenty-six `SHART_REFUSALS` discriminators. That text is product-approved legal wording a
 * beneficiary may dispute before the Authority, it is owned by E10/E12, and it has no group in
 * `DIST_VOCAB` at all — so those always render through `<DiagnosticCode>` directly, beside the one
 * catalogued sentence for the halt.
 */
export async function DistVocabLabel({
  locale,
  vocab,
  value,
  fallback,
}: {
  readonly locale: string;
  readonly vocab: DistVocabName;
  /** `null` means the fact is NOT RECORDED — a different thing from an unrecognised value. */
  readonly value: string | null;
  /** Shown when `value` is `null`. Usually `common.notRecorded`, supplied by the caller. */
  readonly fallback?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  if (value === null || value === '') return <>{fallback ?? tCommon('notRecorded')}</>;
  if (!isKnownDistVocab(vocab, value)) return <DiagnosticCode locale={locale} code={value} />;

  return <>{t(distVocabKey(vocab, value))}</>;
}

/**
 * The same resolution, for the places that need a plain `string` rather than a node — a chip's `label`,
 * an `aria-label`, a `<title>`.
 *
 * It returns the RAW CODE for an unrecognised value, which is the same honesty as the component: the
 * caller shows it verbatim rather than substituting a friendly lie.
 */
export async function distVocabText(
  locale: string,
  vocab: DistVocabName,
  value: string | null,
  fallback?: string,
): Promise<string> {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  if (value === null || value === '') return fallback ?? tCommon('notRecorded');
  if (!isKnownDistVocab(vocab, value)) return value;
  return t(distVocabKey(vocab, value));
}
