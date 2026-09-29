import { getTranslations } from 'next-intl/server';

import { getNamespace, resolveLocale } from '@qmulate/i18n';
import { Card, Eyebrow, Heading, Mono, Text, Well } from '@qmulate/ui';

import { Chip } from '@/components/endowments/Chip';
import { DiagnosticCode } from '@/components/endowments/DiagnosticCode';
import { VocabLabel } from '@/components/endowments/VocabLabel';
import { LINE_STATUS_TONE } from '@/lib/distributions/labels';
import { entitlementRuleSentence, reasonSentence } from '@/lib/distributions/statement-copy';

import { distVocabText } from './DistVocabLabel';
import { Sar } from './Sar';

import type { LineView, TotalsView } from '@/lib/distributions/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ONE LINE PER RECORDED BENEFICIARY, AND EVERY REASON RENDERED AS A CODE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The engine emits a line for every recorded beneficiary, not only for the paid ones. An excluded
 * beneficiary and a withheld beneficiary are two different facts, and both belong on the screen:
 *
 *   · `EXCLUDED` — not entitled under this deed in this period. Entitlement is zero.
 *   · `WITHHELD` — fully entitled, and a PROCEDURAL HOLD is stopping payment. Invariant I6 asserts that
 *     a hold never moves a single halala, so the amount stands unchanged. That is why the amount is
 *     printed on a withheld line and not suppressed: suppressing it would tell a beneficiary their
 *     entitlement had been reduced by a KYC lapse, which is exactly what did not happen.
 *
 * ── THE REASON AND BASIS CODES ARE TIER 1 — AND SINCE M1-a A SUBSET HAS APPROVED COPY ──────
 * `reasonCode` is an `EXCLUSION_REASON_CODES` or `GATE_REASON_CODES` member and `basis.rule` is an
 * `ENTITLEMENT_RULES` member — product-approved legal text a beneficiary may dispute before the
 * Authority, and never invented in a code change. ⊕ M1-b CHANGED WHAT RENDERS, NOT WHO AUTHORS IT:
 * the drafter's ANSWERED wording (M1-a — transcribed verbatim into the ar/en catalogues and
 * byte-locked to `APPROVED-WORDING.md` by the fidelity suite) is now CONSUMED here through
 * `statement-copy.ts`: a covered code shows its approved sentence WITH the machine code beside it
 * (the gate-flag pattern below, unchanged); an uncovered code still renders as a bare
 * `<DiagnosticCode>` beside `lines.noCopyTitle`/`noCopyBody`. Which codes are uncovered is not this
 * file's to decide — the i18n partition law pins that set to the owed register (7 at M1-b).
 *
 * ⚠ `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` is why the authorship rule is not negotiable. Its exclusion
 * REVERSES on the blocking ancestor's death, so its Arabic must not read as permanent — the APPROVED
 * sentence carries that nuance and nothing here may paraphrase it. `REVERSION_PENDING_LIVING_BLOODLINE`
 * prints on a charity's own statement, where copy implying an expectation of the family's death is
 * worse than no copy at all — it is on the owed register and renders as a code. `BUTUN_LINE_NOT_CONTINUED`
 * is permanent under its deed and its approved sentence is deliberately NOT phrased like the temporary
 * ones. One consumption path, no exceptions, no second author.
 *
 * ⚠ AND WHAT IS NOT ON THIS SCREEN: the ẓuhūr/buṭūn descent fact. `basis.line` and `basis.lineageLink`
 * are dropped at the loader boundary and there is no catalogue group for either. A label «بطون» beside a
 * beneficiary discloses descent through a daughter; it is an eligibility fact read for ONE computation,
 * never a person's attribute (ADR-0009).
 */
export async function LinesPanel({
  locale,
  lines,
  totals,
}: {
  readonly locale: string;
  readonly lines: readonly LineView[];
  /** `null` on a stored run whose trace records no totals. Absent, not zero. */
  readonly totals: TotalsView | null;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });

  // The "wording approved elsewhere" well shows only when a rendered code actually LACKS approved
  // copy — a run whose every code carries the drafter's sentence has nothing to apologise for.
  const anyUncoveredCode =
    lines.some(
      (line) => line.reasonCode !== null && reasonSentence(locale, line.reasonCode) === null,
    ) ||
    lines.some(
      (line) => line.basis.rule !== '' && entitlementRuleSentence(locale, line.basis.rule) === null,
    );

  return (
    <Card
      as="section"
      className="flex flex-col gap-[var(--space-16)] text-start"
      data-testid="qm-lines"
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <Eyebrow tick>{t('lines.title')}</Eyebrow>
        <Heading level={2}>{t('lines.title')}</Heading>
        <Text tone="mist">{t('lines.gateBody')}</Text>
      </div>

      {lines.length === 0 ? (
        <Text tone="mist" data-testid="qm-lines-empty">
          {t('lines.empty')}
        </Text>
      ) : (
        <ul className="flex flex-col gap-[var(--space-12)]">
          {lines.map((line) => (
            <LineCard key={line.beneficiaryId} locale={locale} line={line} />
          ))}
        </ul>
      )}

      {anyUncoveredCode ? (
        <Well className="flex flex-col gap-[var(--space-4)]" data-testid="qm-lines-no-copy">
          <Text variant="body-sm">{t('lines.noCopyTitle')}</Text>
          <Text variant="body-sm" tone="mist">
            {t('lines.noCopyBody')}
          </Text>
        </Well>
      ) : null}

      {totals === null ? null : (
        <div className="flex flex-col gap-[var(--space-8)]">
          <Heading level={3}>{t('totals.title')}</Heading>
          <dl
            className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-12)] sm:grid-cols-2 lg:grid-cols-3"
            data-testid="qm-totals"
          >
            <Total locale={locale} label={t('totals.paid')} value={totals.paidSar} name="paid" />
            <Total
              locale={locale}
              label={t('totals.withheld')}
              value={totals.withheldSar}
              name="withheld"
            />
            <Total
              locale={locale}
              label={t('totals.crossBorder')}
              value={totals.crossBorderSar}
              name="crossBorder"
            />
            <Total
              locale={locale}
              label={t('totals.retained')}
              value={totals.retainedSar}
              name="retained"
            />
            <Total
              locale={locale}
              label={t('totals.entitled')}
              value={totals.entitledSar}
              name="entitled"
            />
            {/* ⚠ OQ-01 IS OPEN: `Setting['distribution.rounding.method']` is seeded UNVERIFIED and where a
                retained halala ultimately GOES is unresolved. It is displayed and labelled here and swept
                nowhere — a screen that quietly folded it into another figure would be code answering a
                question Product and Counsel have not answered. */}
            <Total
              locale={locale}
              label={t('totals.residual')}
              value={totals.residualSar}
              name="residual"
            />
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="qm-label">{t('totals.entitledLineCount')}</dt>
              <dd>
                <Mono>{String(totals.entitledLineCount)}</Mono>
              </dd>
            </div>
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="qm-label">{t('totals.excludedCount')}</dt>
              <dd>
                <Mono>{String(totals.excludedCount)}</Mono>
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}

/**
 * One line, as its own `async` server component.
 *
 * ⚠ IT IS A SEPARATE COMPONENT BECAUSE `await` CANNOT LIVE INSIDE A `.map` CALLBACK. `distVocabText` is
 * async (it resolves a catalogue label, and an unrecognised value comes back as the raw code), so a chip
 * label inside a loop needs a component boundary. That is the house pattern — `BeneficiaryPanel`'s
 * `BeneficiaryTr` does exactly this — and not a stylistic choice.
 */
async function LineCard({ locale, line }: { readonly locale: string; readonly line: LineView }) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <li>
      <Card
        as="article"
        tinted
        bordered
        data-testid="qm-line"
        data-beneficiary-id={line.beneficiaryId}
        data-line-status={line.status}
        className="flex flex-col gap-[var(--space-12)]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-12)]">
          <div className="flex flex-col gap-[var(--space-4)]">
            <span className="qm-label">{t('lines.beneficiary')}</span>
            {/* A beneficiary id, not a name: no procedure resolves one to a person, and inventing a
                display name from a string nobody validated would put a real person's identity on screen. */}
            <Mono>{line.beneficiaryId}</Mono>
          </div>
          <Chip
            tone={LINE_STATUS_TONE[line.status] ?? 'neutral'}
            label={await distVocabText(locale, 'lineStatus', line.status)}
            data-testid="qm-line-status"
          />
        </div>

        <dl className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-8)] sm:grid-cols-2">
          <div className="flex flex-col gap-[var(--space-4)]">
            <dt className="qm-label">{t('lines.entitled')}</dt>
            <dd>
              {/* Printed on a WITHHELD line too, and deliberately: invariant I6 asserts that a
                  procedural hold moves not one halala, so suppressing the amount would tell a
                  beneficiary their entitlement had been reduced by a KYC lapse. It was not. */}
              <Well as="output" className="inline-flex w-fit" data-testid="qm-line-entitled">
                <Sar locale={locale} value={line.entitledSar} />
              </Well>
            </dd>
          </div>
          <div className="flex flex-col gap-[var(--space-4)]">
            <dt className="qm-label">{t('lines.share')}</dt>
            <dd>
              {/* The engine's SIX decimals, verbatim. Display-only, never a base for an allocation:
                  the money is allocated in integer halalas by largest remainder. */}
              {/* The hook is on the wrapper: `MonoProps` declares no `data-*` passthrough. */}
              <span data-testid="qm-line-share">
                <Mono>{`${line.sharePercent}%`}</Mono>
              </span>
            </dd>
          </div>
        </dl>

        {/* ── The basis: the rule and the tier, and nothing about descent ────────────────── */}
        <div className="flex flex-col gap-[var(--space-4)]">
          <span className="qm-label">{t('lines.basisTitle')}</span>
          <dl className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-8)] sm:grid-cols-2">
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="text-body-sm text-mist">{t('lines.rule')}</dt>
              <dd data-testid="qm-line-rule">
                {line.basis.rule === '' ? (
                  <Text variant="body-sm" tone="mist">
                    {tCommon('notRecorded')}
                  </Text>
                ) : (
                  /* The drafter's approved sentence when the code has one (M1-a, consumed via
                     statement-copy.ts), the machine code ALWAYS beside it — the gate-flag
                     pattern. An owed-register code renders the code alone. */
                  <StatementWithCode
                    locale={locale}
                    code={line.basis.rule}
                    sentence={entitlementRuleSentence(locale, line.basis.rule)}
                    testId="qm-line-rule-statement"
                  />
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="text-body-sm text-mist">{t('lines.tier')}</dt>
              <dd>
                {line.basis.tabaqa === null ? (
                  <Text variant="body-sm" tone="mist">
                    {tCommon('notRecorded')}
                  </Text>
                ) : (
                  <Mono>{String(line.basis.tabaqa)}</Mono>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="text-body-sm text-mist">{tCommon('endowment')}</dt>
              <dd>
                <VocabLabel
                  locale={locale}
                  vocab="beneficiaryKind"
                  value={line.basis.kind === '' ? null : line.basis.kind}
                />
              </dd>
            </div>
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="text-body-sm text-mist">{t('lines.reason')}</dt>
              <dd data-testid="qm-line-reason">
                {line.reasonCode === null ? (
                  <Text variant="body-sm" tone="mist">
                    {tCommon('notApplicable')}
                  </Text>
                ) : (
                  /* Approved sentence (exclusionReason, else withheldReason — the STATEMENT
                     voice) when one exists; the machine code always beside it. */
                  <StatementWithCode
                    locale={locale}
                    code={line.reasonCode}
                    sentence={reasonSentence(locale, line.reasonCode)}
                    testId="qm-line-reason-statement"
                  />
                )}
              </dd>
            </div>
          </dl>
        </div>

        {line.gateFlags.length === 0 ? null : (
          <div className="flex flex-col gap-[var(--space-4)]">
            <span className="qm-label">{t('lines.gateTitle')}</span>
            {/* A gate code IS in `errors.domain` with approved ar/en copy — the five `GATE_REASON_CODES`
                are also domain error codes — so the sentence is shown AND the code beside it, which is
                what an operator quotes in a ticket. */}
            <ul className="flex flex-col gap-[var(--space-8)]">
              {line.gateFlags.map((flag) => (
                <li
                  key={flag}
                  data-testid="qm-line-gate"
                  className="flex flex-wrap items-baseline gap-[var(--space-8)]"
                >
                  <GateSentence locale={locale} code={flag} />
                  <DiagnosticCode locale={locale} code={flag} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </li>
  );
}

/** One money total, in an inset well. */
async function Total({
  locale,
  label,
  value,
  name,
}: {
  readonly locale: string;
  readonly label: string;
  readonly value: string;
  readonly name: string;
}) {
  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      <dt className="qm-label">{label}</dt>
      <dd>
        <Well as="output" className="inline-flex w-fit" data-testid="qm-total" data-total={name}>
          <Sar locale={locale} value={value} />
        </Well>
      </dd>
    </div>
  );
}

/**
 * An approved statement sentence with its machine code beside it — or the code alone.
 *
 * The sentence is CONSUMED from the catalogue (M1-a's verbatim wiring, byte-locked to
 * `APPROVED-WORDING.md`); `null` means the code is on the owed register and renders exactly as it
 * did before M1-b — a bare `<DiagnosticCode>`. The code stays visible in BOTH arms: it is what an
 * operator quotes in a ticket, and hiding it behind a sentence would make the sentence look like
 * the primary key it is not.
 */
function StatementWithCode({
  locale,
  code,
  sentence,
  testId,
}: {
  readonly locale: string;
  readonly code: string;
  readonly sentence: string | null;
  readonly testId: string;
}) {
  return (
    <span className="flex flex-wrap items-baseline gap-[var(--space-8)]">
      {sentence === null ? null : (
        <span data-testid={testId} data-code={code}>
          {/* `as="span"`: this sits inside a flex <span>, where the default <p> is invalid HTML. */}
          <Text as="span" variant="body-sm" tone="mist">
            {sentence}
          </Text>
        </span>
      )}
      <DiagnosticCode locale={locale} code={code} />
    </span>
  );
}

/**
 * A gate code's catalogued sentence, or nothing at all.
 *
 * The five `GATE_REASON_CODES` are ALSO `DOMAIN_ERROR_CODES`, so each has approved ar/en copy at
 * `errors.domain.<CODE>`. An unrecognised value renders no sentence — the `<DiagnosticCode>` beside it
 * still shows what happened, and next-intl would otherwise PRINT `errors.domain.WHATEVER` on screen.
 */
function GateSentence({ locale, code }: { readonly locale: string; readonly code: string }) {
  const domain: Record<string, string> = getNamespace(resolveLocale(locale), 'errors').domain;
  const sentence = Object.hasOwn(domain, code) ? domain[code] : undefined;
  return sentence === undefined ? null : (
    <Text variant="body-sm" tone="mist">
      {sentence}
    </Text>
  );
}
