import { getTranslations } from 'next-intl/server';

import { Card, Heading, Mono, Text } from '@qmulate/ui';

import { MAINTENANCE_RESERVE_NONE, MAINTENANCE_RESERVE_UNSPECIFIED } from '@/lib/endowments/labels';

import { Chip } from './Chip';
import { DiagnosticCode } from './DiagnosticCode';
import { DualDateValue } from './DualDateValue';
import { RecordList, type RecordRow } from './RecordList';
import { UnverifiedMark } from './UnverifiedMark';
import { VocabLabel } from './VocabLabel';

import type { Loaded, ShartCompleteness, ShartRecord, ShartTier } from '@/lib/endowments/types';

/**
 * شرط الواقف — the founder's conditions, as a RECORD (BR-103).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THERE IS NO EDIT AFFORDANCE ON THIS SCREEN. NOT A DISABLED ONE EITHER.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The Shart al-Waqif is written once and cannot be changed — not by a direct edit, a migration, a
 * backfill, a "correction", and not by any approval, however complete (binding rule 1, ADR-0006).
 * The database enforces it with an unconditional trigger; `loaders.ts` ships no writer; and this
 * screen offers no control.
 *
 * A GREYED-OUT "Edit" BUTTON WOULD BE WORSE THAN NONE. It would teach a Nazir that the conditions
 * are editable by someone with the right permission — that there is a key, held elsewhere — when
 * the entire point is that no such key exists. Instead the screen states the rule in words, in both
 * languages, and states what a LAWFUL correction actually is: a SUPERSEDING INSTRUMENT recorded as a
 * NEW record alongside this one, leaving the original exactly as it stands. That is the affordance —
 * a sentence, because the action itself belongs to a later epic and to a competent authority, not
 * to this form.
 *
 * ── `unspecified` IS NOT `none`, AND THE UI MAY NOT COLLAPSE THEM ──────────────────────────
 * A deed that is SILENT on the maintenance reserve (or whose term is illegible) and a deed that
 * POSITIVELY STIPULATES no reserve are different facts about what a founder instructed. The seed
 * treats the distinction as load-bearing and so does this screen: two sentences, plus a note saying
 * why they are kept apart. Anything else renders as a machine code rather than being guessed at.
 *
 * ── THE HALT IS ONE SENTENCE PLUS A LIST OF CODES ──────────────────────────────────────────
 * `wouldHaltWith` carries `SHART_REFUSALS` discriminators. Their ar/en statement copy is
 * product-approved legal text a beneficiary may dispute before the Authority; E10/E12 owns it and it
 * must not be invented here. So the reader gets the ONE catalogued sentence for a halt and the
 * discriminators as untranslated diagnostic codes.
 *
 * TODO(surface): the twenty-six SHART_REFUSALS discriminators have no ar/en statement copy yet —
 * ENTITLEMENT_HELD_BY_LIVING_ANCESTOR above all, whose Arabic must not read as permanent, since the
 * exclusion reverses on the living ancestor's death.
 *
 * ── ARABIC IS AUTHORITATIVE, SO A LATIN ENUM MEMBER IS A DEFECT, NOT A STYLE (V-E3-L5) ────
 * The order rule shipped as `<Mono>ORDERED</Mono>` while `endowments.entitlementOrderValue.ORDERED`
 * — "ترتيب طبقي — الأعلى فالأعلى" — already existed and the record screen already used it. That is
 * fixed: it goes through `<VocabLabel>` like every other deed term.
 *
 * The remaining Latin vocabulary on this screen is rendered as CODES rather than as bare words,
 * because no ar/en copy exists for it anywhere in `packages/i18n`:
 *
 *   TODO(copy) — four groups of ORDINARY UI LABELS are missing, and this file cannot invent them
 *   because the catalogues are not this task's to edit (see the register's V-E3-L5 note):
 *     · `disbursementChannel.kind`  FAMILY | CHARITABLE | MIXED | DIRECT_USE | UNSPECIFIED
 *     · `maintenanceReserve.kind`   fixed | percent | target_topup   (`none`/`unspecified` are done)
 *     · `nazirFee.basis`            PERCENT_OF_REVENUE | PERCENT_OF_NET_INCOME | RETAINER | UNSPECIFIED
 *     · the deed's LINES            ZUHUR | BUTUN | NA
 *   These are ordinary vocabulary, NOT the E10/E12 legal text — a translator can write them. Until
 *   someone does, a code is the honest rendering; a Latin word placed where a sentence belongs is
 *   an untranslated screen that looks finished.
 */
export async function ShartPanel({
  locale,
  shart,
  completeness,
}: {
  readonly locale: string;
  readonly shart: ShartRecord;
  /** Loaded separately: a refusal on completeness must not blank the recorded conditions. */
  readonly completeness: Loaded<ShartCompleteness>;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const tErrors = await getTranslations({ locale, namespace: 'errors' });

  const notRecorded = tCommon('notRecorded');
  const { structured } = shart;

  const maintenanceValue =
    structured.maintenanceReserveKind === MAINTENANCE_RESERVE_UNSPECIFIED
      ? t('shart.unspecified')
      : structured.maintenanceReserveKind === MAINTENANCE_RESERVE_NONE
        ? t('shart.noneStipulated')
        : null;

  const rows: readonly RecordRow[] = [
    {
      key: 'version',
      label: t('shart.versionLabel'),
      value: shart.version === null ? notRecorded : <Mono>{String(shart.version)}</Mono>,
    },
    {
      key: 'setAt',
      label: t('shart.setAt'),
      value:
        shart.setAt === null ? notRecorded : <DualDateValue locale={locale} date={shart.setAt} />,
    },
    {
      key: 'orderRule',
      /**
       * ⚠ THE ORDER RULE IS A FOUNDER'S CONDITION AND IT RENDERS AS WORDS (V-E3-L5).
       *
       * It shipped as `<Mono>ORDERED</Mono>` — MEASURED on fixture `waqf-001`, one Latin token
       * inside `<bdi dir="ltr">` on the Arabic page, directly above a continuation stipulation
       * rendering correctly as "الظهور فقط (خط الأبناء)". The copy already existed:
       * `endowments.entitlementOrderValue.*` carries all four members in both locales, and the
       * record screen was already using it. Arabic is authoritative (NFR-01), so a Latin enum
       * member is not an acceptable rendering of what a founder instructed.
       *
       * `VocabLabel` also keeps the honesty: a value with no catalogue entry falls through to
       * `<DiagnosticCode>` rather than to a raw dotted key or an invented word.
       */
      label: t('shart.orderRule'),
      value: (
        <VocabLabel
          locale={locale}
          vocab="entitlementOrder"
          value={structured.orderRule}
          fallback={notRecorded}
        />
      ),
    },
    {
      key: 'continuation',
      label: t('fields.continuationStipulation'),
      // No default, ever. Absent stays absent and keeps halting the engine.
      value: (
        <VocabLabel
          locale={locale}
          vocab="continuation"
          value={structured.continuationStipulation}
          fallback={notRecorded}
        />
      ),
    },
    {
      key: 'tiers',
      label: t('shart.tiers'),
      value:
        structured.tiers.length === 0 ? (
          t('shart.empty')
        ) : (
          <span className="flex flex-col gap-[var(--space-4)]">
            {structured.tiers.map((tier, index) => (
              <TierLine
                key={`${String(tier.tabaqa ?? 'x')}-${String(index)}`}
                locale={locale}
                tier={tier}
              />
            ))}
          </span>
        ),
    },
    {
      key: 'lines',
      label: t('shart.lines'),
      value:
        structured.lines.length === 0 ? (
          t('shart.empty')
        ) : (
          /* ẒUHŪR / BUṬŪN, the lines the deed continues. No catalogue group exists for them, so
             they render as CODES rather than as bare Latin text pretending to be words — see the
             TODO(copy) in this file's header. */
          <span className="flex flex-wrap gap-[var(--space-8)]">
            {structured.lines.map((line) => (
              <DiagnosticCode key={line} locale={locale} code={line} />
            ))}
          </span>
        ),
    },
    {
      key: 'maintenance',
      label: t('shart.maintenanceReserve'),
      /* The two catalogued kinds read as sentences; anything else — `fixed`, `percent`,
         `target_topup`, or the api's `unrecognised` sentinel — has no ar/en copy and renders as a
         code, never as a bare Latin word dressed up as a label. */
      value: maintenanceValue ?? (
        <DiagnosticCode locale={locale} code={structured.maintenanceReserveKind} />
      ),
      // The distinction between "silent" and "positively none" is stated, not assumed.
      note: t('shart.unspecifiedNote'),
    },
    {
      key: 'disbursementChannel',
      label: t('shart.disbursementChannel'),
      /* مصرف الريع. FAMILY | CHARITABLE | MIXED | DIRECT_USE | UNSPECIFIED — none of them
         catalogued, so all five render as codes (TODO(copy) in the header). */
      value: <DiagnosticCode locale={locale} code={structured.disbursementChannelKind} />,
    },
    {
      key: 'nazirFee',
      label: t('shart.nazirFee'),
      /**
       * ⚠ SET BY THE DEED (Art. 11), NOT BY STATUTE. The customary 10% (ʿushr) is UNVERIFIED, and
       * the Authority's own <=10%-of-net-income fee is a DIFFERENT figure entirely — conflating the
       * two is the mistake this label exists to avoid.
       *
       * The rate is a figure and the amount is money: both render in Geist Mono, tabular and
       * LTR-isolated, and the amount stays the decimal STRING it crossed the wire as. It is never
       * parsed into a JS number on the way to the screen (NFR-08).
       *
       * ⚠ THE BASIS IS A WORD, NOT A FIGURE, and `PERCENT_OF_REVENUE` is not that word in either
       * language. It has no catalogue group, so it renders as a code (TODO(copy) in the header)
       * rather than as Latin text sitting where a sentence belongs.
       */
      value: (
        <span className="flex flex-wrap items-center gap-[var(--space-8)]">
          {structured.nazirFee.basis === null ? null : (
            <DiagnosticCode locale={locale} code={structured.nazirFee.basis} />
          )}
          {structured.nazirFee.ratePercent === null ? null : (
            <Mono size="body-sm">{`${String(structured.nazirFee.ratePercent)}%`}</Mono>
          )}
          {structured.nazirFee.amountSar === null ? null : (
            <Mono size="body-sm">{structured.nazirFee.amountSar}</Mono>
          )}
          {structured.nazirFee.basis === null &&
          structured.nazirFee.ratePercent === null &&
          structured.nazirFee.amountSar === null
            ? notRecorded
            : null}
        </span>
      ),
      note: <UnverifiedMark locale={locale} />,
    },
  ];

  return (
    <div className="flex flex-col gap-[var(--space-24)]">
      {/* The immutability statement leads the screen. It is the first thing a reader should learn
          about this record, and it replaces the edit control that is deliberately absent. */}
      <Card as="section" className="flex flex-col gap-[var(--space-12)] text-start">
        <Chip tone="info" label={t('shart.immutableTitle')} data-testid="qm-shart-immutable" />
        <Text tone="mist">{t('shart.immutableBody')}</Text>

        <section
          className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-16)]"
          data-testid="qm-shart-superseding"
        >
          <Heading level={3}>{t('shart.supersedingTitle')}</Heading>
          <Text tone="mist">{t('shart.supersedingBody')}</Text>
        </section>
      </Card>

      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <Heading level={2}>{t('shart.structuredTitle')}</Heading>
        <RecordList rows={rows} data-testid="qm-shart-structured" />
      </Card>

      {completeness.status === 'ok' ? (
        <CompletenessPanel
          locale={locale}
          completeness={completeness.value}
          haltSentence={tErrors('domain.SHART_INCOMPLETE')}
        />
      ) : null}
    </div>
  );
}

/**
 * One ṭabaqa the deed names: its tier number, its Arabic label, the lines it covers, and the
 * absolute weight the deed stipulates for it.
 *
 * ⚠ `stipulatedWeight: null` IS A FACT, NOT A GAP — it means the deed stipulates no absolute weight,
 * and the engine then renormalises relative weights within the entitled cohort. It renders as absent
 * rather than as zero, because a zero weight is a different instruction entirely (a taker whose
 * recorded weight is 0 is EXCLUDED).
 *
 * The lines are the recorded ẓuhūr/buṭūn values. They are shown here as the DEED'S OWN terms, which
 * is what a tier is; they are never rendered against a person.
 *
 * ⚠ The ṭabaqa NUMBER and the stipulated WEIGHT are figures and stay in `<Mono>`; the LINES are
 * vocabulary with no ar/en copy and render as codes, the same way the `lines` row above does. A
 * figure in mono is a figure; a Latin word in mono is a missing translation wearing a disguise.
 */
function TierLine({ locale, tier }: { readonly locale: string; readonly tier: ShartTier }) {
  return (
    <span className="flex flex-wrap items-baseline gap-[var(--space-8)]">
      {tier.tabaqa === null ? null : <Mono size="body-sm">{String(tier.tabaqa)}</Mono>}
      {tier.labelAr === null ? null : (
        <span lang="ar" className="text-body-sm text-ink">
          {tier.labelAr}
        </span>
      )}
      {tier.lines.map((line) => (
        <DiagnosticCode key={line} locale={locale} code={line} />
      ))}
      {tier.stipulatedWeight === null ? null : (
        <Mono size="body-sm" tone="mist">
          {String(tier.stipulatedWeight)}
        </Mono>
      )}
    </span>
  );
}

/**
 * What is missing, what is merely advisory, and what a distribution would refuse with today.
 *
 * The `missing` / `advisory` split is the seed's own load-bearing distinction: `missing` HALTS a
 * computation, `advisory` does not. Presenting them as one list would tell a Nazir that a
 * cosmetic gap stops the endowment paying, or — far worse — that a halting gap does not.
 */
async function CompletenessPanel({
  locale,
  completeness,
  haltSentence,
}: {
  readonly locale: string;
  readonly completeness: ShartCompleteness;
  /** `errors.domain.SHART_INCOMPLETE` — the ONE user-facing sentence for a halt. */
  readonly haltSentence: string;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const nothingHalting =
    completeness.missing.length === 0 && completeness.wouldHaltWith.length === 0;

  return (
    <Card as="section" className="flex flex-col gap-[var(--space-16)]">
      <Heading level={2}>{t('shart.completenessTitle')}</Heading>
      <Text tone="mist">{t('shart.completenessIntro')}</Text>

      {nothingHalting ? (
        <Chip tone="success" label={t('shart.complete')} data-testid="qm-shart-complete" />
      ) : null}

      {completeness.missing.length === 0 ? null : (
        <section className="flex flex-col gap-[var(--space-8)]" data-testid="qm-shart-missing">
          <Heading level={3}>{t('shart.missingTitle')}</Heading>
          <Text tone="mist">{t('shart.missingBody')}</Text>
          <ul className="flex flex-wrap gap-[var(--space-8)]">
            {completeness.missing.map((field) => (
              <li key={field}>
                <DiagnosticCode locale={locale} code={field} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {completeness.advisory.length === 0 ? null : (
        <section
          className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-16)]"
          data-testid="qm-shart-advisory"
        >
          <Heading level={3}>{t('shart.advisoryTitle')}</Heading>
          <Text tone="mist">{t('shart.advisoryBody')}</Text>
          <ul className="flex flex-wrap gap-[var(--space-8)]">
            {completeness.advisory.map((field) => (
              <li key={field}>
                <DiagnosticCode locale={locale} code={field} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {completeness.wouldHaltWith.length === 0 ? null : (
        <section
          className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-16)]"
          data-testid="qm-shart-would-halt"
        >
          <Heading level={3}>{t('shart.wouldHaltTitle')}</Heading>
          {/* THE one catalogued sentence a beneficiary reads for a halt. Everything below it is a
              machine code, because the per-discriminator legal wording is E10/E12's to approve. */}
          <Text>{haltSentence}</Text>
          <Text variant="body-sm" tone="mist">
            {t('shart.wouldHaltBody')}
          </Text>
          <ul className="flex flex-wrap gap-[var(--space-8)]">
            {completeness.wouldHaltWith.map((code) => (
              <li key={code}>
                <DiagnosticCode locale={locale} code={code} />
              </li>
            ))}
          </ul>

          {/* ⚠ HALTING GAPS WITH NO MAPPED DISCRIMINATOR, NAMED RATHER THAN DROPPED. A halting gap
              that produced no entry above would read on screen as "nothing would go wrong". */}
          {completeness.unmappedHaltingGaps.length === 0 ? null : (
            <ul
              className="flex flex-wrap gap-[var(--space-8)]"
              data-testid="qm-shart-unmapped-gaps"
            >
              {completeness.unmappedHaltingGaps.map((gap) => (
                <li key={gap}>
                  <DiagnosticCode locale={locale} code={gap} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Card>
  );
}
