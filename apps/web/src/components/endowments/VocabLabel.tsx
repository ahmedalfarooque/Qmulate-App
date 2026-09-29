import { getTranslations } from 'next-intl/server';

import { isKnownVocab, vocabKey, type VocabName } from '@/lib/endowments/labels';

import { DiagnosticCode } from './DiagnosticCode';

/**
 * A domain code, rendered as its ar/en label — or as an untranslated diagnostic code when the
 * catalogue has no entry for it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THIS COMPONENT EXISTS BECAUSE next-intl DOES NOT THROW FOR A MISSING MESSAGE — IT PRINTS THE KEY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/api` sends every domain enum across the wire as a `string`, so a screen cannot assume a
 * value has a label. A bare `t(\`classificationValue.${value}\`)` on an unexpected value renders
 * `endowments.classificationValue.WHATEVER` on a Nazir's screen, and no suite goes red: the catalogue
 * parity test only compares ar against en, and the static scan cannot follow a key built at runtime.
 *
 * So every enum-ish value goes through here. The membership list lives in ONE place (`VOCAB` in
 * `lib/endowments/labels.ts`) and `packages/i18n/test/messages.test.ts` pins each group
 * member-for-member in both locales and in both directions, so the translated branch cannot lose an
 * entry either.
 *
 * ⚠ IT NEVER GUESSES AND IT NEVER HIDES. An unrecognised value is shown, as itself, in mono — a
 * visible gap an operator can quote in a ticket. Rendering an em-dash or "unknown" would erase a
 * fact the database is asserting about a legal record.
 *
 * ⚠ WHAT MUST NOT COME THROUGH HERE: the distribution exclusion-reason, entitlement-rule and
 * computationTrace codes, and the twenty-six `SHART_REFUSALS` discriminators. That copy is
 * product-approved legal text owned by E10/E12 and may not be invented; those always render through
 * `<DiagnosticCode>` directly, beside the one catalogued sentence for a halt.
 */
export async function VocabLabel({
  locale,
  vocab,
  value,
  fallback,
}: {
  readonly locale: string;
  readonly vocab: VocabName;
  /** `null` means the fact is NOT RECORDED — a different thing from an unrecognised value. */
  readonly value: string | null;
  /** Shown when `value` is `null`. Usually `common.notRecorded`, supplied by the caller. */
  readonly fallback?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  if (value === null) return <>{fallback ?? tCommon('notRecorded')}</>;
  if (!isKnownVocab(vocab, value)) return <DiagnosticCode locale={locale} code={value} />;

  return <>{t(vocabKey(vocab, value))}</>;
}

/**
 * The same resolution, for the places that need a plain `string` rather than a node — a chip's
 * `label`, an `aria-label`, a `<title>`.
 *
 * It returns the RAW CODE for an unrecognised value, which is the same honesty as the component: the
 * caller shows it verbatim rather than substituting a friendly lie.
 */
export async function vocabText(
  locale: string,
  vocab: VocabName,
  value: string | null,
  fallback?: string,
): Promise<string> {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  if (value === null) return fallback ?? tCommon('notRecorded');
  if (!isKnownVocab(vocab, value)) return value;
  return t(vocabKey(vocab, value));
}
