import { getTranslations } from 'next-intl/server';

import { Button, Card, Heading, Label, Mono, Text } from '@qmulate/ui';

import { Chip, type ChipTone } from './Chip';
import { DualDateValue } from './DualDateValue';
import { RecordList, type RecordRow } from './RecordList';
import { UnverifiedMark } from './UnverifiedMark';
import { VocabLabel, vocabText } from './VocabLabel';

import type { ReservedMatter, ReservedMatterRecordedStep } from '@/lib/endowments/types';

import { recordChainStepAction } from './reserved-actions';

/** The three BR-1102 steps, in chain order — the same vocabulary the domain and the SQL twin use. */
const CHAIN_STEPS = [
  {
    step: 'PRINCIPAL_CONSENT',
    stateKey: 'principalConsent',
    labelKey: 'reserved.principalConsent',
  },
  { step: 'COUNSEL_REVIEW', stateKey: 'counselReview', labelKey: 'reserved.counselReview' },
  { step: 'AUTHORITY_NOTICE', stateKey: 'authorityNotice', labelKey: 'reserved.authorityNotice' },
] as const;

const FIELD =
  'rounded-[var(--radius-8)] border border-line bg-surface px-[var(--space-12)] py-[var(--space-8)] text-body text-ink';

/**
 * Reserved matters: recorded, then VISIBLY BLOCKED until the Nazir approves (BR-306 / BR-1102).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * "BLOCKED" IS A STATE ON THE RECORD, NOT A GREYED-OUT BUTTON
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Raising a reserved matter performs NO state change on its subject. A disposal request does not
 * dispose; an istibdal request does not substitute. The act stays blocked until an APPROVED request
 * naming THAT VERY SUBJECT exists — and the guarantee is enforced at the database (the write is
 * wrapped in `withReservedMatter()`, which verifies an approved, maker != checker reserved matter for
 * this endowment before setting the session variable the trigger reads), not by hiding a control.
 *
 * So a PENDING matter renders as a warning chip plus the sentence that says the act has not been
 * performed. An APPROVED one says the act may now be executed AGAINST THIS APPROVAL AND NO OTHER
 * SUBJECT — because an approval for one subject is not a key for another.
 *
 * ── THE APPROVAL AUTHORITY IS THE NAZIR, AND THERE IS NO SECOND SEAT ──────────────────────
 * `maker` and `checker` are shown as separate rows because maker != checker is proven against the
 * PERSISTED maker id, and because there is no standing approver role in this product (ADR-0004 /
 * ADR-0005): approval is an act the Nazir holds, not a job title someone is given.
 *
 * ── S4 HONESTY ABOUT THE CHAIN ────────────────────────────────────────────────────────────
 * BR-1102's full chain — the principal's consent, counsel review, the Authority's notice or approval
 * — is RECORDED here and NOT ENFORCED. The panel names the steps and marks each one recorded / not
 * recorded / not required, so a reader can see what is missing rather than infer that an approved
 * matter carried a complete chain. Enforcing it is E11's. Showing a complete-looking chain that was
 * never checked would be the dangerous version of this screen.
 *
 * ⚠ ISTIBDAL PROCEEDS ARE CORPUS (أصل), NOT YIELD. Recording a substitution writes no receipt and
 * can never feed a distribution — the non-diminution invariant is not a preference. The panel states
 * that beside any substitution matter, and the notice window (ten business days) carries the
 * unverified marker because the figure is unverified against primary law.
 */

/** Tone is a reading aid; the chip's words carry the status. An unknown value falls back to neutral. */
const STATUS_TONE: Readonly<Record<string, ChipTone>> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  EXECUTED: 'info',
  VOID: 'neutral',
};

const CHAIN_TONE: Readonly<Record<string, ChipTone>> = {
  RECORDED: 'success',
  NOT_RECORDED: 'warning',
  NOT_REQUIRED: 'neutral',
};

export async function ReservedMatterPanel({
  locale,
  matters,
}: {
  readonly locale: string;
  readonly matters: readonly ReservedMatter[];
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });

  if (matters.length === 0) {
    return (
      <Card as="section" className="flex flex-col gap-[var(--space-8)] text-start">
        <Heading level={2}>{t('reserved.title')}</Heading>
        <Text tone="mist">{t('reserved.empty')}</Text>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-[var(--space-16)]" data-testid="qm-reserved-matters">
      {matters.map((matter) => (
        <li key={matter.approvalRequestId}>
          <MatterCard locale={locale} matter={matter} />
        </li>
      ))}
    </ul>
  );
}

async function MatterCard({
  locale,
  matter,
}: {
  readonly locale: string;
  readonly matter: ReservedMatter;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const isBlocked = matter.status === 'PENDING';
  const isIstibdal = matter.kind === 'ASSET_SUBSTITUTION_ISTIBDAL';

  const rows: readonly RecordRow[] = [
    {
      key: 'subject',
      label: t('reserved.subject'),
      value: (
        <span className="flex flex-wrap items-center gap-[var(--space-8)]">
          {matter.subjectType === null ? null : (
            <Mono size="body-sm" tone="mist">
              {matter.subjectType}
            </Mono>
          )}
          {matter.subjectId === null ? (
            tCommon('notRecorded')
          ) : (
            <Mono size="body-sm">{matter.subjectId}</Mono>
          )}
        </span>
      ),
    },
    {
      key: 'maker',
      label: t('reserved.maker'),
      value:
        matter.makerId === null ? (
          tCommon('notRecorded')
        ) : (
          <Mono size="body-sm">{matter.makerId}</Mono>
        ),
    },
    {
      key: 'checker',
      label: t('reserved.checker'),
      value:
        matter.checkerId === null ? (
          tCommon('notRecorded')
        ) : (
          <Mono size="body-sm">{matter.checkerId}</Mono>
        ),
    },
    {
      key: 'decidedAt',
      label: t('reserved.decidedAt'),
      value:
        matter.decidedAt === null ? (
          tCommon('notRecorded')
        ) : (
          <DualDateValue locale={locale} date={matter.decidedAt} />
        ),
    },
  ];

  return (
    <Card
      as="article"
      data-testid="qm-reserved-matter"
      data-status={matter.status}
      data-kind={matter.kind}
      data-blocked={isBlocked ? 'true' : 'false'}
      className="flex flex-col gap-[var(--space-16)] text-start"
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-12)]">
        {/* ⚠ `kind` is NULL for every row minted before migration 12, and it renders as "not
            recorded" rather than being inferred from the subject — inferring one would manufacture an
            authority the maker never asked for. */}
        <Heading level={3}>
          <VocabLabel locale={locale} vocab="reservedMatterKind" value={matter.kind} />
        </Heading>
        <span className="flex flex-wrap items-center gap-[var(--space-8)]">
          <Chip
            tone={STATUS_TONE[matter.status] ?? 'neutral'}
            label={await vocabText(locale, 'approvalStatus', matter.status)}
          />
          {isBlocked ? (
            // THE BLOCKED INDICATOR. Words, not a colour and not an absent button.
            <Chip
              tone="danger"
              label={t('reserved.blockedBadge')}
              data-testid="qm-reserved-blocked"
            />
          ) : null}
        </span>
      </div>

      {isBlocked ? (
        <Text tone="mist">{t('reserved.blockedBody')}</Text>
      ) : matter.status === 'APPROVED' ? (
        <Text tone="mist">{t('reserved.approvedBody')}</Text>
      ) : null}

      <RecordList rows={rows} />

      {isIstibdal ? (
        <section
          className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-16)]"
          data-testid="qm-istibdal-note"
        >
          <Heading level={3}>{t('reserved.istibdalTitle')}</Heading>
          {/* Binding rule 1, on the screen: corpus and income never mix. */}
          <Text tone="mist">{t('reserved.istibdalCorpusNote')}</Text>
          <Text variant="body-sm" tone="mist">
            {t('reserved.istibdalWindow')}
          </Text>
          <UnverifiedMark locale={locale} />
        </section>
      ) : null}

      <section className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-16)]">
        <Heading level={3}>{t('reserved.chainTitle')}</Heading>
        <Text tone="mist">{t('reserved.chainIntro')}</Text>
        {/* ⊕ S12-2: ENFORCED, and the screen says so — the database refuses the sign while a step is missing. */}
        <div data-testid="qm-reserved-chain-enforced">
          <Text variant="body-sm" tone="mist">
            {t('reserved.chainEnforced')}
          </Text>
        </div>
        <ul className="flex flex-col gap-[var(--space-12)]" data-testid="qm-reserved-chain">
          {CHAIN_STEPS.map((entry) => (
            <ChainRow
              key={entry.step}
              locale={locale}
              step={entry.step}
              label={t(entry.labelKey)}
              state={matter.chain[entry.stateKey]}
              recorded={matter.recorded[entry.stateKey]}
              recordedByLabel={t('reserved.recordedBy')}
              recordedAtLabel={t('reserved.recordedAt')}
              referenceLabel={t('reserved.reference')}
            />
          ))}
        </ul>

        {/* ⊕ S12-2 · THE SIGN'S STATE, IN A SENTENCE (§10 §9). Only a PENDING matter has a sign to
            disable; a decided one shows its decision above. */}
        {isBlocked ? (
          matter.chainMissing.length > 0 ? (
            <div
              role="status"
              data-testid="qm-reserved-sign-blocked"
              data-missing={matter.chainMissing.join(',')}
              className="flex flex-col gap-[var(--space-4)] rounded-[var(--radius-8)] border border-line p-[var(--space-12)]"
            >
              <Text variant="body-sm" className="font-medium">
                {t('reserved.signBlockedTitle')}
              </Text>
              <Text variant="body-sm" tone="mist">
                {t('reserved.signBlockedBody')}
              </Text>
              <ul className="flex flex-wrap gap-[var(--space-8)]">
                {matter.chainMissing.map((step) => (
                  <li key={step} data-testid="qm-reserved-missing-step" data-step={step}>
                    <Chip
                      tone="warning"
                      label={<VocabLabel locale={locale} vocab="chainStep" value={step} />}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div data-testid="qm-reserved-sign-ready">
              <Text tone="mist">{t('reserved.signReady')}</Text>
            </div>
          )
        ) : null}

        {/* ⊕ S12-2 · RECORD A RECEIVED STEP — drawn ONLY to a seat holding `legal:reserved_matter:write`,
            and only for a PENDING matter with a step still missing (a control the reader cannot use is a
            false statement about the product). One form per missing step; the step travels as a hidden
            field so the form cannot record a step other than the one it labels. */}
        {isBlocked && matter.writable.recordStep && matter.chainMissing.length > 0 ? (
          <section
            className="flex flex-col gap-[var(--space-12)] border-t border-line pt-[var(--space-16)]"
            data-testid="qm-reserved-record"
          >
            <Heading level={3}>{t('reserved.recordTitle')}</Heading>
            <Text variant="body-sm" tone="mist">
              {t('reserved.recordIntro')}
            </Text>
            {matter.chainMissing.map((step) => (
              <form
                key={step}
                action={recordChainStepAction}
                className="flex flex-col gap-[var(--space-12)]"
                data-testid="qm-reserved-record-form"
                data-step={step}
              >
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="waqfId" value={matter.waqfId} />
                <input type="hidden" name="approvalRequestId" value={matter.approvalRequestId} />
                <input type="hidden" name="step" value={step} />
                <Text variant="body-sm" className="font-medium">
                  <VocabLabel locale={locale} vocab="chainStep" value={step} />
                </Text>
                <div className="grid grid-cols-1 gap-[var(--space-12)] sm:grid-cols-2">
                  <div className="flex flex-col gap-[var(--space-4)]">
                    <Label
                      htmlFor={`qm-reserved-ref-${matter.approvalRequestId}-${step}`}
                      requiredLabel={tCommon('required')}
                    >
                      {t('reserved.reference')}
                    </Label>
                    <input
                      id={`qm-reserved-ref-${matter.approvalRequestId}-${step}`}
                      name="reference"
                      type="text"
                      required
                      maxLength={256}
                      placeholder={t('reserved.referencePlaceholder')}
                      className={FIELD}
                      data-testid="qm-reserved-reference"
                    />
                  </div>
                  <div className="flex flex-col gap-[var(--space-4)]">
                    <Label htmlFor={`qm-reserved-doc-${matter.approvalRequestId}-${step}`}>
                      {t('reserved.documentId')}
                    </Label>
                    <input
                      id={`qm-reserved-doc-${matter.approvalRequestId}-${step}`}
                      name="documentId"
                      type="text"
                      maxLength={64}
                      placeholder={t('reserved.documentIdPlaceholder')}
                      className={FIELD}
                      data-testid="qm-reserved-document"
                    />
                  </div>
                </div>
                <div>
                  <Button type="submit" variant="primary" data-testid="qm-reserved-record-save">
                    {t('reserved.record')}
                  </Button>
                </div>
              </form>
            ))}
          </section>
        ) : null}
      </section>
    </Card>
  );
}

function ChainRow({
  locale,
  step,
  label,
  state,
  recorded,
  recordedByLabel,
  recordedAtLabel,
  referenceLabel,
}: {
  readonly locale: string;
  readonly step: string;
  readonly label: string;
  readonly state: string;
  readonly recorded: ReservedMatterRecordedStep | null;
  readonly recordedByLabel: string;
  readonly recordedAtLabel: string;
  readonly referenceLabel: string;
}) {
  return (
    <li data-chain-state={state} data-step={step} className="flex flex-col gap-[var(--space-4)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-8)]">
        <span className="text-body-sm text-ink">{label}</span>
        <Chip
          tone={CHAIN_TONE[state] ?? 'neutral'}
          label={<VocabLabel locale={locale} vocab="chainState" value={state} />}
        />
      </div>
      {/* ⊕ S12-2 · a RECORDED step shows who recorded it, when (dual-dated), and what it rests on. */}
      {recorded === null ? null : (
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-[var(--space-12)] gap-y-[var(--space-4)] text-body-sm"
          data-testid="qm-reserved-step-recorded"
        >
          <dt className="text-mist">{recordedByLabel}</dt>
          <dd>{recorded.by === null ? '—' : <Mono size="body-sm">{recorded.by}</Mono>}</dd>
          <dt className="text-mist">{recordedAtLabel}</dt>
          <dd>
            <DualDateValue locale={locale} date={recorded.at} />
          </dd>
          <dt className="text-mist">{referenceLabel}</dt>
          <dd>
            {recorded.reference === null ? '—' : <Mono size="body-sm">{recorded.reference}</Mono>}
          </dd>
        </dl>
      )}
    </li>
  );
}
