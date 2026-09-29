import { getTranslations } from 'next-intl/server';

import { Card, Heading, Mono, Text } from '@qmulate/ui';

import { Chip, type ChipTone } from './Chip';
import { DualDateValue } from './DualDateValue';
import { UnverifiedMark } from './UnverifiedMark';
import { VocabLabel, vocabText } from './VocabLabel';

import type { BeneficiaryRow } from '@/lib/endowments/types';
import type { ReactNode } from 'react';

/**
 * The beneficiary registry (BR-201…BR-206), as a READ-ONLY table. The write surface (enrolment,
 * death certification, KYC refresh, category capture, the UBO dataset) is a later pass; nothing
 * here offers a control, disabled or otherwise.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS TABLE DELIBERATELY DOES NOT SHOW
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  · NO `lineageLink`, anywhere — no column, no tooltip, no icon. It is the ẓuhūr/buṭūn
 *    ELIGIBILITY FACT, read for exactly one computation, and must never be rendered as a
 *    person's gender (ADR-0009). The api's registry projection does not even send it, and the
 *    view model has no field for it; this comment exists so nobody "helpfully" adds one.
 *  · NO entitlement verdict, and no arithmetic that could produce one. Who is entitled TODAY is
 *    the engine's per-run answer over the living frontier, and it is TEMPORARY
 *    (ENTITLEMENT_HELD_BY_LIVING_ANCESTOR reverses on a death) — a screen that computed or
 *    cached it would render a durable claim the engine never made.
 *
 * ── THE THREE VITAL STATES ARE THREE SENTENCES (R7-D1, owner-confirmed) ────────────────────
 * `active: true` is living. `active: false` WITH a certification is a certified death, shown
 * with its dual date. `active: false` WITHOUT one is a SCOPE EXIT — a placeholder's inactivity
 * cannot certify a death — and it renders as its own state, never as "deceased".
 *
 * ── BR-206: A CATEGORY_ONLY ROW WITHOUT ITS CAPTURED CATEGORY IS DISBURSEMENT-BLOCKED ──────
 * `CATEGORY_NOT_CAPTURED` is rank 0 in the engine's gate ladder, so the registry says so in
 * words on the row itself, not in a detail view a Nazir may never open.
 *
 * ── KYC (BR-205): STALE ≠ UNVERIFIED ───────────────────────────────────────────────────────
 * The chip renders the api's computed classification — through the same domain predicates the
 * distribution gates run — and the two non-fresh states keep separate labels. The refresh
 * window behind STALE is `Setting['kyc.refreshIntervalMonths']`, a figure UNVERIFIED against
 * primary law, so the panel's note names the setting key and carries the unverified marker
 * (binding rule 3) instead of printing "12 months" as though it were the law.
 */

const KYC_TONE: Readonly<Record<string, ChipTone>> = {
  FRESH: 'success',
  STALE: 'warning',
  UNVERIFIED: 'danger',
};

const VERIFICATION_TONE: Readonly<Record<string, ChipTone>> = {
  VERIFIED: 'success',
  PENDING: 'neutral',
  UNVERIFIED: 'warning',
};

const KIND_TONE: Readonly<Record<string, ChipTone>> = {
  FAMILY: 'neutral',
  CHARITABLE_JIHA: 'info',
  CATEGORY_ONLY: 'neutral',
};

export async function BeneficiaryPanel({
  locale,
  rows,
}: {
  readonly locale: string;
  readonly rows: readonly BeneficiaryRow[];
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });

  return (
    <Card as="section" className="flex flex-col gap-[var(--space-16)]">
      <div className="flex flex-col gap-[var(--space-4)] text-start">
        <Heading level={2}>{t('beneficiaries.registryTitle')}</Heading>
        <Text tone="mist">{t('beneficiaries.intro')}</Text>
      </div>

      {rows.length === 0 ? (
        <Text tone="mist">{t('beneficiaries.empty')}</Text>
      ) : (
        // Wide content scrolls inside its own container: the PAGE never scrolls horizontally.
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[64rem] border-collapse text-start"
            data-testid="qm-beneficiary-registry"
          >
            <thead>
              <tr className="border-b border-line">
                <Th>{t('beneficiaries.columnMember')}</Th>
                <Th>{t('beneficiaries.columnKind')}</Th>
                <Th>{t('beneficiaries.columnStatus')}</Th>
                <Th>{t('beneficiaries.columnVerification')}</Th>
                <Th>{t('beneficiaries.columnKyc')}</Th>
                <Th>{t('beneficiaries.columnResidency')}</Th>
                <Th>{t('beneficiaries.columnTier')}</Th>
                <Th>{t('beneficiaries.columnShares')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <BeneficiaryTr key={row.id} locale={locale} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Binding rule 3, on use: the freshness window is a Setting, named by KEY — never printed
          as a figure the screen would be asserting as law. */}
      <div className="flex flex-wrap items-center gap-[var(--space-8)] border-t border-line pt-[var(--space-12)]">
        <Text variant="body-sm" tone="mist">
          {t('beneficiaries.kycNote')}
        </Text>
        <Mono size="body-sm" tone="mist">
          kyc.refreshIntervalMonths
        </Mono>
        <UnverifiedMark locale={locale} />
      </div>
      <Text variant="body-sm" tone="mist">
        {t('beneficiaries.sharesNote')}
      </Text>
    </Card>
  );
}

async function BeneficiaryTr({
  locale,
  row,
}: {
  readonly locale: string;
  readonly row: BeneficiaryRow;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const notRecorded = tCommon('notRecorded');

  return (
    <tr data-beneficiary={row.id} className="border-b border-line last:border-b-0 align-top">
      {/* Member: the Arabic relationship is AUTHORITATIVE (NFR-01) and always renders, in its own
          script; the English label is secondary and never replaces it. */}
      <Td>
        <span className="flex flex-col gap-[var(--space-4)]">
          <span lang="ar" className="text-body text-ink">
            {row.relationshipAr}
          </span>
          {row.relationshipEn === null ? null : (
            <span lang="en" className="text-body-sm text-mist">
              {row.relationshipEn}
            </span>
          )}
          <span lang="ar" className="text-body-sm text-mist">
            {row.branch}
          </span>
          <Mono size="body-sm" tone="mist">
            {row.id}
          </Mono>
        </span>
      </Td>

      <Td>
        <span className="flex flex-col items-start gap-[var(--space-4)]">
          <Chip
            tone={KIND_TONE[row.kind] ?? 'neutral'}
            label={await vocabText(locale, 'beneficiaryKind', row.kind)}
            data-testid="qm-beneficiary-kind"
          />
          {/* BR-203: the beneficial-owner flag is its own chip, distinct from every status. */}
          {row.isUbo ? (
            <Chip tone="info" label={t('beneficiaries.ubo')} data-testid="qm-beneficiary-ubo" />
          ) : null}
        </span>
      </Td>

      {/* THREE vital states, three sentences — a scope exit is not a death (R7-D1). */}
      <Td>
        <span className="flex flex-col items-start gap-[var(--space-4)]">
          {row.active ? (
            <Chip tone="success" label={t('beneficiaries.statusActive')} />
          ) : row.deceased !== null ? (
            <>
              <Chip tone="neutral" label={t('beneficiaries.statusDeceased')} />
              <span className="text-body-sm text-mist">
                {t('beneficiaries.deathCertified')}
                {': '}
                <DualDateValue locale={locale} date={row.deceased} />
              </span>
            </>
          ) : (
            <Chip
              tone="warning"
              label={t('beneficiaries.statusInactive')}
              data-testid="qm-beneficiary-scope-exit"
            />
          )}
          {/* BR-206: an uncaptured CATEGORY_ONLY class is disbursement-blocked, said on the row. */}
          {row.kind === 'CATEGORY_ONLY' ? (
            row.categoryCaptured ? (
              <Chip tone="neutral" label={t('beneficiaries.categoryCaptured')} />
            ) : (
              <Chip
                tone="danger"
                label={t('beneficiaries.categoryNotCaptured')}
                data-testid="qm-beneficiary-category-blocked"
              />
            )
          ) : null}
        </span>
      </Td>

      <Td>
        <Chip
          tone={VERIFICATION_TONE[row.verificationStatus] ?? 'neutral'}
          label={await vocabText(locale, 'beneficiaryVerification', row.verificationStatus)}
        />
      </Td>

      {/* KYC freshness — COMPUTED, never stored. STALE and UNVERIFIED stay different labels. */}
      <Td>
        <span className="flex flex-col items-start gap-[var(--space-4)]">
          <Chip
            tone={KYC_TONE[row.kycFreshness] ?? 'neutral'}
            label={await vocabText(locale, 'kycFreshness', row.kycFreshness)}
            data-testid="qm-beneficiary-kyc"
          />
          {row.kycLastRefreshed === null ? null : (
            <span className="text-body-sm text-mist">
              <DualDateValue locale={locale} date={row.kycLastRefreshed} />
            </span>
          )}
        </span>
      </Td>

      <Td>
        <VocabLabel locale={locale} vocab="beneficiaryResidency" value={row.residency} />
      </Td>

      <Td>
        {row.tabaqa === null ? notRecorded : <Mono size="body-sm">{String(row.tabaqa)}</Mono>}
      </Td>

      {/* Decimal STRINGS, rendered verbatim — never parsed into JS numbers (NFR-08). */}
      <Td>
        <span className="flex flex-col gap-[var(--space-4)]">
          <span>
            {t('beneficiaries.sharePercent')}
            {': '}
            {row.sharePercent === null ? (
              notRecorded
            ) : (
              <Mono size="body-sm">{`${row.sharePercent}%`}</Mono>
            )}
          </span>
          <span>
            {t('beneficiaries.stipulatedWeight')}
            {': '}
            {row.stipulatedWeight === null ? (
              notRecorded
            ) : (
              <Mono size="body-sm">{row.stipulatedWeight}</Mono>
            )}
          </span>
        </span>
      </Td>
    </tr>
  );
}

/** Mono uppercase header cell in Latin, IBM Plex Sans Arabic 600 in Arabic — `.qm-label` picks. */
function Th({ children }: { readonly children: ReactNode }) {
  return (
    <th scope="col" className="qm-label px-[var(--space-8)] py-[var(--space-8)] text-start">
      {children}
    </th>
  );
}

function Td({ children }: { readonly children: ReactNode }) {
  return (
    <td className="px-[var(--space-8)] py-[var(--space-12)] align-top text-body-sm text-ink">
      {children}
    </td>
  );
}
