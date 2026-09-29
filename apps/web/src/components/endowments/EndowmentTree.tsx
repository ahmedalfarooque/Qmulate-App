import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { Card, Eyebrow, Heading, Mono, Surface, Text } from '@qmulate/ui';

import { endowmentPath } from '@/lib/endowments/paths';

import { Chip } from './Chip';
import { CLASSIFICATION_TONE } from './EndowmentHeader';
import { vocabText } from './VocabLabel';

import type { NavigationTree, TreeClient, TreeEndowment, TreeWaqif } from '@/lib/endowments/types';

/**
 * The Client → Waqif → Endowment hierarchy (BR-102).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS ABSENT FROM THIS TREE IS AS IMPORTANT AS WHAT IS IN IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The tree renders exactly what the caller's ACTIVE grants reach, because the Prisma force filter
 * narrows Client and Waqif to the families and founders owning at least one endowment in
 * `authorizedWaqfIds`. So a founder whose only endowment is out of scope does not appear as an
 * empty branch — the branch is not there at all, and a caller with no grant sees an empty tree
 * rather than a chrome full of locked rows. A client-level `Membership` widens nothing (MP-13).
 *
 * That is why an EMPTY branch still gets a sentence: "no endowment within your access scope" is a
 * statement about the reader's scope, not about the family. Rendering nothing would leave a Nazir
 * unsure whether the family has no endowments or whether the screen failed.
 *
 * ── NAMES ARE BILINGUAL DATA, NOT COPY ────────────────────────────────────────────────────
 * `nameAr` / `nameEn` are columns. The screen picks the one matching the page's language and marks
 * the element's `lang`, so a mixed record renders each script in its own face through the `:lang`
 * cascade — no font prop, no second stylesheet. Both are invented fixture names.
 *
 * ⚠ THERE IS NO "NEW CLIENT" / "NEW ENDOWMENT" CONTROL HERE, AND THAT IS DELIBERATE. Client, Waqif
 * and Endowment CREATION is unscoped at the database layer — a Client has no `waqfId`, so the
 * endowment-scoped rung cannot guard it — and both halves are assigned to E11 in writing. Shipping
 * a create button would need a new permission resource, which is an authority-model change, not a
 * code convenience. A disabled button that leads nowhere would be worse still: it teaches the
 * reader the product is broken. SURFACED, not resolved.
 */
export async function EndowmentTree({
  locale,
  tree,
}: {
  readonly locale: string;
  readonly tree: NavigationTree;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });

  if (tree.clients.length === 0) {
    return (
      <Card as="section" className="flex flex-col gap-[var(--space-8)] text-start">
        <Heading level={3}>{t('empty')}</Heading>
        <Text tone="mist">{t('emptyBody')}</Text>
      </Card>
    );
  }

  return (
    <div
      aria-label={t('tree.label')}
      role="group"
      data-testid="qm-endowment-tree"
      className="flex flex-col gap-[var(--space-24)]"
    >
      {tree.clients.map((client) => (
        <ClientBranch key={client.id} locale={locale} client={client} />
      ))}
    </div>
  );
}

async function ClientBranch({
  locale,
  client,
}: {
  readonly locale: string;
  readonly client: TreeClient;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  // Arabic is authoritative and `nameEn` is nullable, so an Arabic-only record falls back to Arabic
  // rather than to a placeholder.
  const name = locale === 'ar' ? client.nameAr : (client.nameEn ?? client.nameAr);

  return (
    <Card as="section" data-testid="qm-tree-client" className="flex flex-col gap-[var(--space-20)]">
      <div className="flex flex-col gap-[var(--space-4)] text-start">
        <Eyebrow>{t('tree.clientLabel')}</Eyebrow>
        <Heading level={2} lang={locale === 'ar' ? 'ar' : 'en'}>
          {name}
        </Heading>
      </div>

      {client.waqifs.length === 0 ? (
        <Text tone="mist">{t('tree.noWaqif')}</Text>
      ) : (
        <ul className="flex flex-col gap-[var(--space-16)]">
          {client.waqifs.map((waqif) => (
            <li key={waqif.id}>
              <WaqifBranch locale={locale} waqif={waqif} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function WaqifBranch({
  locale,
  waqif,
}: {
  readonly locale: string;
  readonly waqif: TreeWaqif;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const name = locale === 'ar' ? waqif.nameAr : (waqif.nameEn ?? waqif.nameAr);

  return (
    // A nested card lifts with `--color-panel-tint`, never with a deeper shadow: stacked heavy
    // shadows are banned (DESIGN.md §9).
    <Card
      as="article"
      tinted
      data-testid="qm-tree-waqif"
      className="flex flex-col gap-[var(--space-16)]"
    >
      <div className="flex flex-col gap-[var(--space-4)] text-start">
        <Eyebrow>{t('tree.waqifLabel')}</Eyebrow>
        <Heading level={3} lang={locale === 'ar' ? 'ar' : 'en'}>
          {name}
        </Heading>
      </div>

      {waqif.waqfs.length === 0 ? (
        <Text tone="mist">{t('tree.noEndowment')}</Text>
      ) : (
        <ul className="grid grid-cols-1 gap-[var(--space-12)] lg:grid-cols-2">
          {waqif.waqfs.map((waqf) => (
            <li key={waqf.id}>
              <EndowmentLink locale={locale} waqf={waqf} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function EndowmentLink({
  locale,
  waqf,
}: {
  readonly locale: string;
  readonly waqf: TreeEndowment;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    // `interactive` supplies the raised → inset press and the focus ring from <Surface>, the one
    // source of depth. The >=3:1 non-shadow affordance cue is the `--color-edge` border.
    <Surface
      as={Link}
      variant="raised-sm"
      radius="card"
      interactive
      href={endowmentPath(locale, waqf.id)}
      data-testid="qm-tree-endowment"
      className="flex h-full flex-col gap-[var(--space-8)] border border-edge p-[var(--space-16)] text-start"
    >
      <span className="flex flex-wrap items-center justify-between gap-[var(--space-8)]">
        {/* LTR-isolated: a certificate number must not reorder against Arabic text. */}
        <Mono tone="ink">{waqf.certificateNumber}</Mono>
        <Chip
          tone={CLASSIFICATION_TONE[waqf.classification] ?? 'neutral'}
          label={await vocabText(locale, 'classification', waqf.classification)}
        />
      </span>

      <span className="text-body-sm text-mist">
        {`${await vocabText(locale, 'waqfType', waqf.type)} · ${await vocabText(locale, 'waqfNature', waqf.nature)}`}
      </span>

      <span className="text-body-sm text-mist">
        {`${t('fields.entitlementOrder')}: ${await vocabText(locale, 'entitlementOrder', waqf.entitlementOrder)}`}
      </span>

      <span className="mt-auto flex items-center gap-[var(--space-8)] text-body-sm text-blue-strong">
        {tCommon('openRecord')}
      </span>
    </Surface>
  );
}
