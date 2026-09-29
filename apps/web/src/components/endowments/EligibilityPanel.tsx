import { getTranslations } from 'next-intl/server';

import { Card, Heading, Mono, Text, Well } from '@qmulate/ui';

import { isKnownVocab } from '@/lib/endowments/labels';

import { Chip } from './Chip';
import { UnverifiedMark } from './UnverifiedMark';
import { VocabLabel } from './VocabLabel';

import type { EligibilityVerdict } from '@/lib/endowments/types';

/**
 * Why a candidate Nazir — or a delegated representative — is blocked (BR-109 / NFR-09).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE EXIT CLAUSE IS "BLOCKED WITH A CLEAR REASON", AND "CLEAR" IS A UI PROPERTY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A resolver that answers `false` satisfies half of it. The other half is this panel: the refusal
 * has to read as a SENTENCE in the page's own language — "the trustee must be resident in the
 * Kingdom" — not as `KSA_RESIDENCY_REQUIRED`. So the reason list is rendered as copy from
 * `packages/i18n`, in ar and en, and only falls back to the machine code when the resolver emits a
 * reason the catalogue does not carry.
 *
 * ⚠ THESE ARE ORDINARY E3 VALIDATION MESSAGES, NOT DISTRIBUTION REASON CODES. The prohibition on
 * inventing copy covers exclusion-reason, entitlement-rule and computationTrace codes — the text a
 * beneficiary may dispute before the Authority, owned by E10/E12. An eligibility refusal is a form
 * validation message about an appointment, and writing it is this epic's job.
 *
 * ── THREE STATES PER CRITERION, NOT TWO ───────────────────────────────────────────────────
 * `satisfied: null` is NOT ASSESSED. It is neither a pass nor a fail, it is rendered as its own
 * state, and where the criterion is binding it is a REFUSAL (`ELIGIBILITY_NOT_ASSESSED`) — because
 * treating an unanswered condition as satisfied is how an ineligible trustee gets appointed by
 * omission. The two conditional criteria (Saudi nationality where the founder is foreign and real
 * property is held; an Authority licence where the Nazir is a legal person) are shown as
 * NOT BINDING HERE when the context does not engage them, rather than hidden — a reader has to be
 * able to see that a condition was considered and found irrelevant.
 *
 * ⚠ THE PANEL CARRIES THE UNVERIFIED MARKER whenever the resolver flags any criterion: the
 * statutory basis (Beneficial Ownership Standards Art. 8(1), Nazarah reg. Art. 11(5)) is UNVERIFIED
 * against primary law, and WHICH of the seven conditions bind a REPRESENTATIVE at all is an open
 * legal question. The build implements the fail-safe — a non-resident representative blocks —
 * pending the answer. One marker per panel rather than one per row: repeated fourteen times it
 * stops being read, which is the failure mode a caveat cannot afford.
 */
export async function EligibilityPanel({
  locale,
  verdict,
  subject,
  'data-testid': testId,
}: {
  readonly locale: string;
  readonly verdict: EligibilityVerdict;
  /** Which appointment this verdict is about — the primary Nazir or the representative. */
  readonly subject: 'primary' | 'representative';
  readonly 'data-testid'?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });

  return (
    <Card
      as="section"
      tinted
      data-testid={testId}
      data-eligible={verdict.eligible ? 'true' : 'false'}
      className="flex flex-col gap-[var(--space-16)] text-start"
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-12)]">
        <Heading level={3}>
          {subject === 'primary'
            ? t('eligibility.subjectPrimary')
            : t('eligibility.subjectRepresentative')}
        </Heading>
        <Chip
          tone={verdict.eligible ? 'success' : 'danger'}
          label={verdict.eligible ? t('eligibility.eligible') : t('eligibility.blocked')}
          data-testid="qm-eligibility-verdict"
        />
      </div>

      {verdict.reasons.length === 0 ? null : (
        <section className="flex flex-col gap-[var(--space-8)]">
          <Text variant="body-sm" tone="danger">
            {t('eligibility.reasonsTitle')}
          </Text>
          <ul className="flex flex-col gap-[var(--space-8)]" data-testid="qm-eligibility-reasons">
            {verdict.reasons.map((reason) => (
              <li key={reason}>
                {isKnownVocab('eligibilityReason', reason) ? (
                  // The sentence. This is what BR-109's exit clause is asking for.
                  <Text tone="ink">{t(`eligibility.reasons.${reason}`)}</Text>
                ) : (
                  /* An unrecognised reason code. Shown as the code plus an honest note, because a
                     plausible-sounding sentence invented here would be worse than a visible gap:
                     the resolver owns the spelling and the mismatch has to be reconciled, not
                     papered over. */
                  <div className="flex flex-col gap-[var(--space-4)]">
                    <Mono size="body-sm" tone="danger">
                      {reason}
                    </Mono>
                    <Text variant="body-sm" tone="mist">
                      {t('eligibility.unknownReason')}
                    </Text>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-[var(--space-8)]">
        <Text variant="body-sm" tone="mist">
          {t('eligibility.criteriaTitle')}
        </Text>
        <ul className="flex flex-col gap-[var(--space-8)]" data-testid="qm-eligibility-criteria">
          {verdict.criteria.map((criterion) => (
            <li key={criterion.key}>
              <Well
                padded={false}
                className="flex flex-wrap items-center justify-between gap-[var(--space-8)] px-[var(--space-12)] py-[var(--space-8)]"
              >
                <span className="min-w-0 text-body-sm text-ink">
                  <VocabLabel locale={locale} vocab="eligibilityCriterion" value={criterion.key} />
                </span>

                <span className="flex flex-wrap items-center gap-[var(--space-8)]">
                  {/* THREE applicabilities, not two. `UNDECIDED_SURFACED` gets its own words. */}
                  <Chip
                    tone={criterion.applicability === 'REQUIRED' ? 'neutral' : 'info'}
                    label={
                      <VocabLabel
                        locale={locale}
                        vocab="criterionApplicability"
                        value={criterion.applicability}
                      />
                    }
                  />
                  {/* Three states. `null` is its own chip, never folded into "not met". */}
                  <Chip
                    tone={
                      criterion.satisfied === true
                        ? 'success'
                        : criterion.satisfied === false
                          ? 'danger'
                          : 'warning'
                    }
                    label={
                      criterion.satisfied === true
                        ? t('eligibility.satisfied')
                        : criterion.satisfied === false
                          ? t('eligibility.notSatisfied')
                          : t('eligibility.notAssessed')
                    }
                  />
                </span>
              </Well>
            </li>
          ))}
        </ul>
        {verdict.criteria.some((criterion) => criterion.unverified) ? (
          <UnverifiedMark locale={locale} />
        ) : null}
      </section>

      {verdict.notAssessed.length === 0 ? null : (
        <section
          className="flex flex-col gap-[var(--space-8)]"
          data-testid="qm-eligibility-unassessed"
        >
          {/* WHICH criteria nobody has checked. One reason code covers them all
              (`ELIGIBILITY_NOT_ASSESSED`) because the remedy is one action — go and check — so the
              identity of each unchecked criterion is DATA rather than a second sentence. */}
          <Text variant="body-sm" tone="warning">
            {t('eligibility.notAssessedTitle')}
          </Text>
          <ul className="flex flex-wrap gap-[var(--space-8)]">
            {verdict.notAssessed.map((key) => (
              <li key={key} className="text-body-sm text-ink">
                <VocabLabel locale={locale} vocab="eligibilityCriterion" value={key} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ⚠ THE VERDICT'S `surfacedQuestions` ARE NOT RENDERED HERE, AND THAT IS THE FIX FOR V-E3-M4.
          They are free-form DEVELOPER PROSE — `SURFACED_REPRESENTATIVE_SCOPE` is one English
          paragraph of 464 characters — and they shipped through <DiagnosticCode> as though they
          were machine codes. MEASURED on the shipped fixture (`waqf-001`, which records an
          authorized representative): the paragraph reached the DOM verbatim in BOTH locales, inside
          `<bdi dir="ltr">` under the Arabic label "رمز تشخيصي" — an English developer note
          announced to a Nazir as a diagnostic code. The domain module's own header says these
          strings "are never rendered to a beneficiary"; that claim was false, and this is where it
          became false. The web layer no longer carries the field at all (`lib/endowments/types.ts`,
          `toVerdict` in `lib/endowments/loaders.ts`), so no screen can reintroduce it by accident.

          NOTHING USER-FACING IS LOST. The fact the paragraph describes — that whether the two
          CONDITIONAL criteria bind an authorized representative is an unanswered legal question —
          is already on this screen, per criterion, as the `UNDECIDED_SURFACED` applicability chip:
          "غير محسوم — يُعرض ولا يُعدّ متحققًا" / "Unsettled — reported, and never treated as met".
          That is catalogued copy in both locales; the paragraph was provenance for whoever reads
          the resolver, not a statement for whoever reads the screen.

          TODO(surface): if the product wants the QUESTION ITSELF stated to a reader — "which of
          BR-109's criteria bind a representative, and does a representative's non-residency block
          or merely flag" — that needs product-approved ar/en copy plus a stable code to hang it on.
          Neither exists: `surfacedQuestions` crosses the wire as free text with no discriminator,
          and the Arabic wording of an open legal question is E10/E12's to approve, not a code
          change's to invent. `endowments.eligibility.surfacedTitle` is left in both catalogues
          unused, waiting for that statement. */}
    </Card>
  );
}
