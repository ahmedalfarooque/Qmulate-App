import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';
import { Button, Card, Eyebrow, Heading, Mono, Text } from '@qmulate/ui';

import { AppShell } from '@/components/AppShell';
import { submitRunAction } from '@/components/distributions/actions';
import { CorpusReceiptsPanel } from '@/components/distributions/CorpusReceiptsPanel';
import { LinesPanel } from '@/components/distributions/LinesPanel';
import { PeriodForm } from '@/components/distributions/PeriodForm';
import { RunNotesPanel } from '@/components/distributions/RunNotesPanel';
import { RunRefusal } from '@/components/distributions/RunRefusal';
import { WaterfallPanel } from '@/components/distributions/WaterfallPanel';
import { WizardSteps } from '@/components/distributions/WizardSteps';
import { DiagnosticCode } from '@/components/endowments/DiagnosticCode';
import { Refusal } from '@/components/endowments/Refusal';
import { holds, loadCaller, previewRun } from '@/lib/distributions/loaders';
import {
  newRunPath,
  nextStep,
  previousStep,
  REFUSAL_PARAM,
  toRunPeriod,
  toWizardStep,
  WIZARD_STEP_KEY,
} from '@/lib/distributions/paths';
import { kernelMessageKey } from '@/lib/trpc/client';

import type { Metadata } from 'next';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE DISTRIBUTION RUN WIZARD — compute → review → submit
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Four steps, all of them SERVER-rendered, with the state in the URL:
 *
 *   1. **Period** — choose the fiscal window, and see the receipts the window contains. This is also the
 *      RECEIPT step, and there is deliberately no selection to make: a receipt's income-vs-capital class was
 *      decided at ENTRY, enforced by a database CHECK that makes an unclassified `REVENUE` row impossible. A
 *      checkbox beside a corpus receipt would imply the class were a choice available here.
 *   2. **Waterfall** — ṣiyāna first, then operating, then the Nazir fee, then the distributable. Plus the
 *      corpus receipts, struck out, so the exclusion is visible rather than inferred from an absence.
 *   3. **Lines** — one line per recorded beneficiary, with the reason each was withheld or excluded, as a
 *      machine code, because that wording is product-approved legal text and not this app's to write.
 *   4. **Review** — everything the run said about itself, and the one control that writes.
 *
 * ── COMPUTING WRITES NOTHING, AND THE SCREEN SAYS SO ──────────────────────────────────────
 * Steps 1–4 are all `distribution.preview`, a QUERY. The run is not in the database, no line item exists,
 * no approval has been minted, and `wizard.previewOnly` states that in both languages. The first write on
 * this screen is the Submit control on step 4, and it is the last thing on the page.
 *
 * ── WHY EVERY STEP RE-COMPUTES ────────────────────────────────────────────────────────────
 * There is no session state and no draft row: each render calls `preview` again with the period from the
 * URL. That is deliberate. A cached preview would let a Nazir review figures computed against a register
 * that has since moved — a beneficiary recorded as deceased, a receipt reclassified — and then submit the
 * stale answer. Re-computing means the Submit control acts on what the screen just showed. It also means
 * `create` computes a THIRD time, server-side, and the digest it stores is of that computation.
 *
 * ⚠ A REFUSAL IS A FIRST-CLASS OUTCOME OF THIS SCREEN, NOT AN ERROR STATE. `SHART_INCOMPLETE` means the
 * founder's conditions cannot resolve entitlement, and the engine halts rather than guessing. The wizard then
 * shows the catalogued halt sentence and the discriminator, and offers no Submit control at all — there is
 * nothing to submit.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'distribution' });
  return { title: t('wizard.title') };
}

export default async function NewRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; waqfId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, waqfId } = await params;
  const query = await searchParams;

  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const period = toRunPeriod(query['periodStart'], query['periodEnd']);
  const step = period === null ? 'period' : toWizardStep(query['step']);

  /**
   * ⚠ THE REFUSAL PARAM IS RE-VALIDATED, NOT TRUSTED BECAUSE AN ACTION WROTE IT. It is a URL param and a
   * caller can type anything into it. `kernelMessageKey` checks the prefix against the two error namespaces,
   * checks the remainder looks like a machine code, and checks the key EXISTS in the catalogue — degrading to
   * `errors.generic`. Without that, any string here could pull an arbitrary catalogue entry into the error
   * slot, and a catalogue is not an authorization boundary.
   */
  const rawRefusal = query[REFUSAL_PARAM];
  const actionRefusal =
    typeof rawRefusal === 'string' ? kernelMessageKey({ messageKey: rawRefusal }, locale) : null;

  const [preview, caller] = await Promise.all([
    period === null ? Promise.resolve(null) : previewRun(locale, waqfId, period),
    loadCaller(locale),
  ]);
  const callerFacts = caller.status === 'ok' ? caller.value : null;

  /** Both verbs are needed, because `submitRunAction` calls `create` and then `submit`. */
  const maySubmit =
    holds(callerFacts, waqfId, 'distribution:run:write') &&
    holds(callerFacts, waqfId, 'distribution:run:initiate');

  const run =
    preview !== null && preview.status === 'ok' && preview.value.status === 'computed'
      ? preview.value.run
      : null;

  const forward = nextStep(step);
  const back = previousStep(step);

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <header className="flex flex-col gap-[var(--space-8)] text-start">
          <Eyebrow tick>{tCommon('endowment')}</Eyebrow>
          <div className="flex flex-wrap items-baseline gap-[var(--space-12)]">
            <Heading level={1}>{t('wizard.title')}</Heading>
            <Mono tone="mist">{waqfId}</Mono>
          </div>
          <Text tone="mist">{t('intro')}</Text>
        </header>

        <WizardSteps locale={locale} waqfId={waqfId} active={step} period={period} />

        {/* A refusal carried back from a mutation. Rendered above the run so it is the first thing read. */}
        {actionRefusal === null ? null : (
          <Refusal locale={locale} messageKey={actionRefusal} title={t('refusal.title')} />
        )}

        {/* The current step's own explanation, always — a step whose purpose is only in its title is a
            wizard that teaches nothing. */}
        <Card as="section" className="flex flex-col gap-[var(--space-4)] text-start">
          <Heading level={2}>{t(`wizard.step${WIZARD_STEP_KEY[step]}`)}</Heading>
          <Text tone="mist">{t(`wizard.step${WIZARD_STEP_KEY[step]}Body`)}</Text>
          <Text variant="body-sm" tone="warning">
            {t('wizard.previewOnly')}
          </Text>
        </Card>

        {/* ── STEP 1 · the window, and the receipts it contains ──────────────────────────── */}
        {step === 'period' ? <PeriodForm locale={locale} waqfId={waqfId} period={period} /> : null}

        {/* A read refusal — a permission or configuration refusal, NOT a statement about the founder's
            conditions, and so rendered as an access refusal rather than as a halt. */}
        {preview !== null && preview.status !== 'ok' ? (
          <Refusal locale={locale} messageKey={preview.messageKey} />
        ) : null}

        {/* The engine halted, or the mapping refused before the engine saw the record. */}
        {preview !== null && preview.status === 'ok' && preview.value.status === 'refused' ? (
          <RunRefusal locale={locale} refusal={preview.value.refusal} />
        ) : null}

        {run === null ? null : (
          <>
            {/* The corpus block appears on the PERIOD step (these are the receipts the window holds) and
                again beside the waterfall and on review. It is the one fact that must not be missable. */}
            {step === 'period' || step === 'waterfall' || step === 'review' ? (
              <CorpusReceiptsPanel
                locale={locale}
                receipts={run.excludedCapitalReceipts}
                totalSar={run.waterfall.capitalReceiptsSar}
              />
            ) : null}

            {step === 'waterfall' || step === 'review' ? (
              <WaterfallPanel locale={locale} waterfall={run.waterfall} />
            ) : null}

            {step === 'lines' || step === 'review' ? (
              <LinesPanel locale={locale} lines={run.lines} totals={run.totals} />
            ) : null}

            {step === 'review' ? (
              <>
                {/* The identity of the answer: which build produced it, and the digest that build's
                    canonical form hashes to. Both become bytes inside what the Nazir signs. */}
                <Card as="section" className="flex flex-col gap-[var(--space-12)] text-start">
                  <Heading level={3}>{t('engineVersion')}</Heading>
                  <Mono size="body-sm">{run.engineVersion}</Mono>
                  <Heading level={3}>{t('runDigest')}</Heading>
                  <div className="overflow-x-auto">
                    <Mono size="body-sm">{run.runDigest}</Mono>
                  </div>
                  <Text variant="body-sm" tone="mist">
                    {t('runDigestBody')}
                  </Text>
                  {/* The run-level entitlement rule is TIER 1 — a machine code, beside the note that
                      says why no sentence appears. */}
                  <Heading level={3}>{t('lines.rule')}</Heading>
                  <DiagnosticCode locale={locale} code={run.entitlementRule} />
                  <Text variant="body-sm" tone="mist">
                    {t('lines.noCopyBody')}
                  </Text>
                </Card>

                <RunNotesPanel
                  locale={locale}
                  flags={run.flags}
                  invariantsChecked={run.invariantsChecked}
                  invariantsNotAsserted={run.invariantsNotAsserted}
                  unverifiedNotes={run.unverifiedNotes}
                  timing={run.timing}
                  authorityNotices={run.authorityNotices}
                  diagnostics={run.diagnostics}
                  trace={run.trace}
                />

                {maySubmit ? (
                  <Card as="section" className="flex flex-col gap-[var(--space-12)] text-start">
                    <Heading level={2}>{t('wizard.stepSubmit')}</Heading>
                    <Text tone="mist">{t('wizard.stepSubmitBody')}</Text>
                    {/*
                     * THE ONLY CONTROL ON THIS SCREEN THAT WRITES.
                     *
                     * It performs TWO kernel calls — `create` then `submit` — and they are two
                     * transactions, not one. If the second refuses, the run exists as `COMPUTED` with no
                     * approval, the redirect lands on the run's own page, and the Submit control is
                     * offered there again. That is a real state and it is shown as one; claiming
                     * atomicity would be worse than the state itself.
                     */}
                    <form action={submitRunAction} className="flex flex-col gap-[var(--space-8)]">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="waqfId" value={waqfId} />
                      <input type="hidden" name="periodStart" value={run.period.start} />
                      <input type="hidden" name="periodEnd" value={run.period.end} />
                      <Button type="submit" variant="primary" data-testid="qm-wizard-submit">
                        {t('wizard.submit')}
                      </Button>
                    </form>
                  </Card>
                ) : null}
              </>
            ) : null}

            {/* Step navigation. Links, not buttons: each step is a server render of a URL. */}
            <nav
              aria-label={t('wizard.title')}
              className="flex flex-wrap items-center gap-[var(--space-12)]"
            >
              {back === null ? null : (
                <Link
                  href={newRunPath(locale, waqfId, { period, step: back })}
                  className="qm-label text-blue-strong underline-offset-4 hover:underline focus-visible:shadow-focus"
                  data-testid="qm-wizard-back"
                >
                  {tCommon('previous')}
                </Link>
              )}
              {forward === null ? null : (
                <Link
                  href={newRunPath(locale, waqfId, { period, step: forward })}
                  className="qm-label text-blue-strong underline-offset-4 hover:underline focus-visible:shadow-focus"
                  data-testid="qm-wizard-next"
                >
                  {tCommon('next')}
                </Link>
              )}
            </nav>
          </>
        )}
      </div>
    </AppShell>
  );
}
