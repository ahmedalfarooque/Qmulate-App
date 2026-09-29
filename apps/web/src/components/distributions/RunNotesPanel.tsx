import { getTranslations } from 'next-intl/server';

import { Card, Eyebrow, Heading, Mono, Text, Well } from '@qmulate/ui';

import { Chip } from '@/components/endowments/Chip';
import { DiagnosticCode } from '@/components/endowments/DiagnosticCode';
import { DualDateValue } from '@/components/endowments/DualDateValue';
import { UnverifiedMark } from '@/components/endowments/UnverifiedMark';
import { DIAGNOSTIC_SEVERITY_TONE } from '@/lib/distributions/labels';

import { DistVocabLabel, distVocabText } from './DistVocabLabel';

import type {
  AuthorityNoticeView,
  MappingDiagnosticView,
  TimingView,
  TraceEntryView,
} from '@/lib/distributions/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * EVERYTHING THE RUN SAID ABOUT ITSELF THAT IS NOT A NUMBER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Five sections, and each exists because leaving it off would let a reader assume something the run did
 * not claim:
 *
 *  1. **Flags** — what the engine wants stated about this computation. `CAPITAL_RECEIPTS_EXCLUDED` and
 *     `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED` are the two the sprint requires visible, and both are
 *     here as full sentences: the first because corpus must be shown as refused rather than hidden, the
 *     second because a zero reserve arrived at by silence is *not a decision anybody made* and a Nazir
 *     signing the run has to know which of the two kinds of zero this is.
 *
 *  2. **Invariants — in TWO lists, never one.** The checked ones, and the ones that make NO CLAIM about
 *     this run. Merging them would let a reader rely on a guarantee that was never given. `I8`
 *     (determinism) is unprovable from a single run and is therefore always in the second list; `I-C1`
 *     (corpus never mixes with income), `I-L1` (per capita) and `I-R1` (no charity paid in the same run
 *     as any descendant) are the three whose hyphenated ids a naive code scan cannot even see.
 *
 *  3. **Timing** — both deadlines, which calendar bound, and the marker. ⚠ The 3-month post-fiscal-year-
 *     end window and `EARLIER_OF` as the binding rule are UNVERIFIED against primary law (binding rule 3).
 *
 *  4. **Mapping diagnostics** — what reading the RECORD noticed, outside the run's digest. A `CONFLICT`
 *     is a defect in the record; a `NOTICE` is an observation about it. They change no figure and are
 *     reported rather than dropped.
 *
 *  5. **The trace** — by STAGE and CODE only. Every trace `message` is FROZEN COPY inside the hashed
 *     bytes the Nazir signs, on the same footing as a trace code, so it does not cross the wire at all
 *     and no surface may render it. `data` is dropped at the loader boundary for the same class of reason
 *     `surfacedQuestions` is: it is free-form developer context, and V-E3-M4 shipped 464 characters of it
 *     into a slot announced in Arabic as "رمز تشخيصي".
 */
export async function RunNotesPanel({
  locale,
  flags,
  invariantsChecked,
  invariantsNotAsserted,
  unverifiedNotes,
  timing,
  authorityNotices,
  diagnostics,
  trace,
}: {
  readonly locale: string;
  readonly flags: readonly string[];
  readonly invariantsChecked: readonly string[];
  readonly invariantsNotAsserted: readonly string[];
  readonly unverifiedNotes: readonly string[];
  readonly timing: TimingView | null;
  readonly authorityNotices: readonly AuthorityNoticeView[];
  readonly diagnostics: readonly MappingDiagnosticView[];
  readonly trace: readonly TraceEntryView[];
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <div className="flex flex-col gap-[var(--space-16)]">
      {/* ── 1 · Flags ──────────────────────────────────────────────────────────────────── */}
      {flags.length === 0 ? null : (
        <Card
          as="section"
          className="flex flex-col gap-[var(--space-12)] text-start"
          data-testid="qm-run-flags"
        >
          <Heading level={3}>{t('intro')}</Heading>
          <ul className="flex flex-col gap-[var(--space-12)]">
            {flags.map((flag) => (
              <li
                key={flag}
                data-testid="qm-run-flag"
                data-flag={flag}
                className="flex flex-col gap-[var(--space-4)]"
              >
                <Text variant="body-sm">
                  <DistVocabLabel locale={locale} vocab="flag" value={flag} />
                </Text>
                {/* The code beside the sentence: what an operator quotes in a ticket. */}
                <DiagnosticCode locale={locale} code={flag} />
              </li>
            ))}
          </ul>
          {unverifiedNotes.length === 0 ? null : (
            <div className="flex flex-col gap-[var(--space-4)]">
              <UnverifiedMark locale={locale} />
              {/* The engine's OWN ⚠ note strings, verbatim: they are copied into the run's result and
                  therefore into the digest, so their spelling is not this app's to normalise. */}
              <ul className="flex flex-col gap-[var(--space-4)]">
                {unverifiedNotes.map((note) => (
                  <li key={note}>
                    <Text variant="body-sm" tone="mist">
                      {note}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* ── 2 · Invariants, in two lists ───────────────────────────────────────────────── */}
      <Card
        as="section"
        className="flex flex-col gap-[var(--space-16)] text-start"
        data-testid="qm-invariants"
      >
        <div className="flex flex-col gap-[var(--space-8)]">
          <Heading level={3}>{t('invariantsCheckedTitle')}</Heading>
          {invariantsChecked.length === 0 ? (
            <Text variant="body-sm" tone="mist">
              {tCommon('notRecorded')}
            </Text>
          ) : (
            <ul className="flex flex-col gap-[var(--space-8)]">
              {invariantsChecked.map((id) => (
                <li key={id} data-testid="qm-invariant-checked" data-invariant={id}>
                  <Text variant="body-sm">
                    <Mono size="body-sm">{id}</Mono>
                    {' — '}
                    <DistVocabLabel locale={locale} vocab="invariant" value={id} />
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-[var(--space-8)]">
          <Heading level={3}>{t('invariantsNotAssertedTitle')}</Heading>
          <Text variant="body-sm" tone="mist">
            {t('invariantsNotAssertedBody')}
          </Text>
          <ul className="flex flex-col gap-[var(--space-8)]">
            {invariantsNotAsserted.map((id) => (
              <li key={id} data-testid="qm-invariant-not-asserted" data-invariant={id}>
                <Text variant="body-sm" tone="mist">
                  <Mono size="body-sm">{id}</Mono>
                  {' — '}
                  <DistVocabLabel locale={locale} vocab="invariant" value={id} />
                </Text>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* ── 3 · Timing ─────────────────────────────────────────────────────────────────── */}
      {timing === null ? null : (
        <Card
          as="section"
          className="flex flex-col gap-[var(--space-12)] text-start"
          data-testid="qm-timing"
        >
          <div className="flex flex-wrap items-center gap-[var(--space-12)]">
            <Eyebrow tick>{t('dashboard.overdueTitle')}</Eyebrow>
            <Chip
              tone={timing.status === 'OVERDUE' ? 'warning' : 'success'}
              label={await distVocabText(locale, 'timingStatus', timing.status)}
              data-testid="qm-timing-status"
            />
          </div>
          <dl className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-12)] sm:grid-cols-2">
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="qm-label">{t('deadlineBasis.POST_FYE_DEFAULT')}</dt>
              <dd>
                <DistVocabLabel locale={locale} vocab="deadlineBasis" value={timing.basis} />
              </dd>
            </div>
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="qm-label">{t('bindingCalendar.EARLIER_OF')}</dt>
              <dd className="flex flex-col gap-[var(--space-4)]">
                <span>
                  <DistVocabLabel
                    locale={locale}
                    vocab="bindingCalendar"
                    value={timing.bindingCalendar}
                  />
                </span>
                <Text variant="body-sm" tone="mist">
                  <DistVocabLabel locale={locale} vocab="bindingCalendar" value={timing.boundBy} />
                </Text>
              </dd>
            </div>
            {/* ⚠ TWO DIFFERENT DAYS, NOT ONE DAY IN TWO CALENDARS. `FYE + N calendar months` and
                `Hijri(FYE) + N Hijri months` land apart, so these are NOT rendered through
                `<DualDateValue>` — that component states that one instant has two spellings. */}
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="qm-label">{tCommon('gregorian')}</dt>
              <dd>
                <Mono>{timing.deadlineGregorian}</Mono>
              </dd>
            </div>
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="qm-label">{tCommon('hijri')}</dt>
              <dd>
                <Mono>{timing.deadlineHijri}</Mono>
              </dd>
            </div>
            <div className="flex flex-col gap-[var(--space-4)]">
              <dt className="qm-label">{t('wizard.stepPeriod')}</dt>
              <dd>
                {/* `asOf` IS one day in two calendars, and the Hijri half is a frozen snapshot. */}
                <DualDateValue locale={locale} date={timing.asOf} />
              </dd>
            </div>
          </dl>
          {timing.unverified ? <UnverifiedMark locale={locale} /> : null}
        </Card>
      )}

      {/* ── Authority notices ──────────────────────────────────────────────────────────── */}
      {authorityNotices.length === 0 ? null : (
        <Card
          as="section"
          className="flex flex-col gap-[var(--space-8)] text-start"
          data-testid="qm-authority-notices"
        >
          <Heading level={3}>{t('authorityNoticeType.CROSS_BORDER_DISBURSEMENT')}</Heading>
          <ul className="flex flex-col gap-[var(--space-8)]">
            {authorityNotices.map((notice) => (
              <li
                key={`${notice.type}:${notice.beneficiaryId ?? ''}`}
                className="flex flex-wrap items-baseline gap-[var(--space-8)]"
              >
                <Text variant="body-sm">
                  <DistVocabLabel locale={locale} vocab="authorityNoticeType" value={notice.type} />
                </Text>
                {notice.beneficiaryId === null ? null : (
                  <Mono size="body-sm">{notice.beneficiaryId}</Mono>
                )}
                {/* ⚠ RENDERED FROM THE CODE. `notice.reason` is developer English and stays server-side. */}
                <DiagnosticCode locale={locale} code={notice.reasonCode} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── 4 · Mapping diagnostics ────────────────────────────────────────────────────── */}
      {diagnostics.length === 0 ? null : (
        <Card
          as="section"
          className="flex flex-col gap-[var(--space-12)] text-start"
          data-testid="qm-diagnostics"
        >
          <div className="flex flex-col gap-[var(--space-4)]">
            <Heading level={3}>{t('diagnosticsTitle')}</Heading>
            <Text tone="mist">{t('diagnosticsBody')}</Text>
          </div>
          <ul className="flex flex-col gap-[var(--space-12)]">
            {diagnostics.map((diagnostic) => (
              <DiagnosticItem
                key={`${diagnostic.code}:${diagnostic.severity}`}
                locale={locale}
                diagnostic={diagnostic}
              />
            ))}
          </ul>
        </Card>
      )}

      {/* ── 5 · The trace ──────────────────────────────────────────────────────────────── */}
      {trace.length === 0 ? null : (
        <Card
          as="section"
          className="flex flex-col gap-[var(--space-12)] text-start"
          data-testid="qm-trace"
        >
          <div className="flex flex-col gap-[var(--space-4)]">
            <Heading level={3}>{t('traceTitle')}</Heading>
            <Text tone="mist">{t('traceBody')}</Text>
          </div>
          {/* Wide content scrolls inside its own container, so the page body never scrolls sideways. */}
          <div className="overflow-x-auto">
            <ol className="flex min-w-0 flex-col gap-[var(--space-8)]">
              {trace.map((entry) => (
                <li
                  key={`${String(entry.seq)}:${entry.code}`}
                  data-testid="qm-trace-step"
                  data-stage={entry.stage}
                  className="flex flex-wrap items-baseline gap-[var(--space-8)]"
                >
                  <Mono size="body-sm" tone="mist">
                    {String(entry.seq)}
                  </Mono>
                  <Text variant="body-sm" tone="mist">
                    <DistVocabLabel locale={locale} vocab="traceStage" value={entry.stage} />
                  </Text>
                  <DiagnosticCode locale={locale} code={entry.code} />
                </li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      {/* An honest floor: a run with nothing to say still says so, rather than rendering as a gap. */}
      {flags.length === 0 &&
      diagnostics.length === 0 &&
      trace.length === 0 &&
      timing === null &&
      invariantsChecked.length === 0 ? (
        <Well data-testid="qm-run-notes-empty">
          <Text variant="body-sm" tone="mist">
            {tCommon('notRecorded')}
          </Text>
        </Well>
      ) : null}
    </div>
  );
}

/**
 * One mapping diagnostic, as its own `async` server component — the house pattern, because the severity
 * chip's label resolves through an async catalogue lookup and `await` cannot live inside a `.map` callback.
 *
 * ⚠ `diagnostic.detail` IS DELIBERATELY NOT RENDERED, and this is the only place it could have been. It is
 * the mapper's own developer English — row ids, column names, spec paragraph references — and it belongs in
 * the operator log, not on a trustee's screen. The catalogued sentence for the CODE says what happened; the
 * code itself is what an operator quotes in a ticket.
 */
async function DiagnosticItem({
  locale,
  diagnostic,
}: {
  readonly locale: string;
  readonly diagnostic: MappingDiagnosticView;
}) {
  return (
    <li
      data-testid="qm-diagnostic"
      data-diagnostic={diagnostic.code}
      className="flex flex-col gap-[var(--space-4)]"
    >
      <div className="flex flex-wrap items-center gap-[var(--space-8)]">
        <Chip
          tone={DIAGNOSTIC_SEVERITY_TONE[diagnostic.severity] ?? 'neutral'}
          label={await distVocabText(locale, 'diagnosticSeverity', diagnostic.severity)}
        />
        <DiagnosticCode locale={locale} code={diagnostic.code} />
      </div>
      <Text variant="body-sm">
        <DistVocabLabel locale={locale} vocab="diagnostic" value={diagnostic.code} />
      </Text>
    </li>
  );
}
