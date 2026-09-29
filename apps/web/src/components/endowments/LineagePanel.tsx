import { getTranslations } from 'next-intl/server';

import { Card, Heading, Mono, Text } from '@qmulate/ui';

import { Chip } from './Chip';
import { DiagnosticCode } from './DiagnosticCode';

import type { BeneficiaryLineage, BeneficiaryRow, LineageMember } from '@/lib/endowments/types';

/**
 * The family tree (BR-204 / ADR-0009), drawn from the parent edges — and NOTHING ELSE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS TREE RENDERS, AND WHAT IT MUST NEVER RENDER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A node shows: the member's id, their recorded relationship (joined from the registry rows the
 * same page already loaded — the lineage projection itself carries no names), the ṭabaqa pair
 * (derived vs recorded, with the disagreement REPORTED, never reconciled), and the vital state.
 *
 *  · NO `lineageLink` (`SON`/`DAUGHTER`) — not as a label, a column, a tooltip, an icon or an
 *    i18n key. It is the ẓuhūr/buṭūn ELIGIBILITY FACT, read for exactly one computation, and it
 *    is dropped at the loader boundary so this component could not render it even by mistake
 *    (ADR-0009). The integrity view below names beneficiary IDS whose edge is missing; it never
 *    names an edge's VALUE.
 *  · NO entitlement or exclusion verdict. Entitlement sits at the living frontier of each line
 *    and is TEMPORARY (R-FRONTIER); it is the engine's per-run answer, never a screen's
 *    arithmetic. This tree is a record of recorded descent, not a statement of who is paid.
 *
 * ── A CHARITABLE JIHA IS NOT A DESCENDANT, SO IT IS NOT A TREE NODE ────────────────────────
 * A `CHARITABLE_JIHA` legitimately carries no parent edge (`parentId: null`), which is the same
 * shape as a child of the waqif. Drawing it at the tree's root would state a bloodline the deed
 * never recorded — so jiha rows are listed in their own section, named as outside the lineage.
 *
 * ── THE WALK IS DEFENSIVE, THE CLAIM IS HONEST ─────────────────────────────────────────────
 * Nesting follows `parentId` with a visited set, so a cyclic graph (which the ENGINE refuses as
 * `LINEAGE_CYCLE`; this read does not detect it) renders a truncated branch rather than hanging
 * the page. A member whose parent is not visible to this caller is drawn at the root and named
 * in `rootedOutsideWaqif` — a scoping fact, reported as such.
 */
export async function LineagePanel({
  locale,
  lineage,
  registry,
}: {
  readonly locale: string;
  readonly lineage: BeneficiaryLineage;
  /** The same page's registry rows, joined by id for the human-readable relationship labels. */
  readonly registry: readonly BeneficiaryRow[];
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });

  const byId = new Map(registry.map((row) => [row.id, row]));
  const descendants = lineage.members.filter((member) => member.kind !== 'CHARITABLE_JIHA');
  const jihas = lineage.members.filter((member) => member.kind === 'CHARITABLE_JIHA');

  const memberIds = new Set(descendants.map((member) => member.id));
  const childrenOf = new Map<string, LineageMember[]>();
  const roots: LineageMember[] = [];
  for (const member of descendants) {
    if (member.parentId === null || !memberIds.has(member.parentId)) {
      // `parentId: null` = a child of the waqif, NEVER "unknown". An unresolvable parent is a
      // scoping fact the integrity view names; the member still renders rather than vanishing.
      roots.push(member);
    } else {
      const siblings = childrenOf.get(member.parentId) ?? [];
      siblings.push(member);
      childrenOf.set(member.parentId, siblings);
    }
  }

  return (
    <div className="flex flex-col gap-[var(--space-24)]">
      <Card as="section" className="flex flex-col gap-[var(--space-16)]">
        <div className="flex flex-col gap-[var(--space-4)] text-start">
          <Heading level={2}>{t('beneficiaries.lineageTitle')}</Heading>
          <Text tone="mist">{t('beneficiaries.lineageIntro')}</Text>
        </div>

        {roots.length === 0 ? (
          <Text tone="mist">{t('beneficiaries.lineageEmpty')}</Text>
        ) : (
          <ul className="flex flex-col gap-[var(--space-12)]" data-testid="qm-lineage-tree">
            {roots.map((member) => (
              <TreeNode
                key={member.id}
                locale={locale}
                member={member}
                byId={byId}
                childrenOf={childrenOf}
                visited={new Set([member.id])}
              />
            ))}
          </ul>
        )}

        {jihas.length === 0 ? null : (
          <section
            className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-16)] text-start"
            data-testid="qm-lineage-non-descendants"
          >
            <Heading level={3}>{t('beneficiaries.nonLineageTitle')}</Heading>
            <Text variant="body-sm" tone="mist">
              {t('beneficiaries.nonLineageBody')}
            </Text>
            <ul className="flex flex-col gap-[var(--space-8)]">
              {jihas.map((member) => (
                <li key={member.id}>
                  <NodeLine locale={locale} member={member} byId={byId} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </Card>

      <IntegrityPanel locale={locale} lineage={lineage} />
    </div>
  );
}

/** One branch, nested. The visited set caps a cyclic graph instead of hanging the page. */
async function TreeNode({
  locale,
  member,
  byId,
  childrenOf,
  visited,
}: {
  readonly locale: string;
  readonly member: LineageMember;
  readonly byId: ReadonlyMap<string, BeneficiaryRow>;
  readonly childrenOf: ReadonlyMap<string, readonly LineageMember[]>;
  readonly visited: ReadonlySet<string>;
}) {
  const children = (childrenOf.get(member.id) ?? []).filter((child) => !visited.has(child.id));

  return (
    <li data-lineage-node={member.id} className="flex flex-col gap-[var(--space-8)] text-start">
      <NodeLine locale={locale} member={member} byId={byId} />
      {children.length === 0 ? null : (
        // Logical indentation only (`ps-`/`border-s`): the tree mirrors under RTL by itself.
        <ul className="flex flex-col gap-[var(--space-8)] border-s border-line ps-[var(--space-16)]">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              locale={locale}
              member={child}
              byId={byId}
              childrenOf={childrenOf}
              visited={new Set([...visited, child.id])}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * One member's line: id, relationship (Arabic authoritative), the ṭabaqa pair, vital state.
 *
 * The vital state joins the registry row where visible, because the lineage projection's
 * `active` boolean alone cannot distinguish a certified death from a scope exit (R7-D1) — and
 * that distinction must not be flattened. Where the row is not visible (a beneficiary session
 * sees only its own registry row), the honest neutral is the inactive wording, never "deceased".
 */
async function NodeLine({
  locale,
  member,
  byId,
}: {
  readonly locale: string;
  readonly member: LineageMember;
  readonly byId: ReadonlyMap<string, BeneficiaryRow>;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const row = byId.get(member.id);

  return (
    <span className="flex flex-wrap items-center gap-[var(--space-8)]">
      <Mono size="body-sm" tone="mist">
        {member.id}
      </Mono>
      {row === undefined ? null : (
        <span lang="ar" className="text-body text-ink">
          {row.relationshipAr}
        </span>
      )}

      {/* طبقة: the DERIVED depth is authoritative; a recorded disagreement is shown, not fixed. */}
      {member.tabaqaDerived === null ? null : (
        <span className="text-body-sm text-mist">
          {t('beneficiaries.tier')}
          {': '}
          <Mono size="body-sm">{String(member.tabaqaDerived)}</Mono>
        </span>
      )}
      {member.agrees ? null : (
        <span className="flex items-center gap-[var(--space-4)]">
          <Chip
            tone="warning"
            label={t('beneficiaries.tierMismatch')}
            data-testid="qm-lineage-tier-mismatch"
          />
          {member.tabaqaRecorded === null ? null : (
            <Mono size="body-sm" tone="mist">
              {String(member.tabaqaRecorded)}
            </Mono>
          )}
        </span>
      )}

      {member.active ? (
        <Chip tone="success" label={t('beneficiaries.statusActive')} />
      ) : row !== undefined && row.deceased !== null ? (
        <Chip tone="neutral" label={t('beneficiaries.statusDeceased')} />
      ) : (
        <Chip tone="warning" label={t('beneficiaries.statusInactive')} />
      )}
    </span>
  );
}

/**
 * The kernel's integrity verdicts — RECOMPUTED on every call, never persisted, and rendered
 * only when non-empty. Each list carries beneficiary IDS, shown as diagnostic codes an operator
 * can quote; the sentences around them are ordinary screen copy, not the E10/E12 legal text.
 */
async function IntegrityPanel({
  locale,
  lineage,
}: {
  readonly locale: string;
  readonly lineage: BeneficiaryLineage;
}) {
  const t = await getTranslations({ locale, namespace: 'endowments' });
  const { integrity } = lineage;

  const sections: readonly {
    readonly key: string;
    readonly title: string;
    readonly body: string;
    readonly ids: readonly string[];
  }[] = [
    {
      key: 'missingLineageLink',
      title: t('beneficiaries.missingLinkTitle'),
      body: t('beneficiaries.missingLinkBody'),
      ids: integrity.missingLineageLink,
    },
    {
      key: 'tabaqaMismatch',
      title: t('beneficiaries.tierMismatchTitle'),
      body: t('beneficiaries.tierMismatchBody'),
      ids: integrity.tabaqaMismatch,
    },
    {
      key: 'rootedOutsideWaqif',
      title: t('beneficiaries.rootedOutsideTitle'),
      body: t('beneficiaries.rootedOutsideBody'),
      ids: integrity.rootedOutsideWaqif,
    },
    {
      key: 'cycles',
      title: t('beneficiaries.cyclesTitle'),
      body: t('beneficiaries.cyclesBody'),
      ids: integrity.cycles,
    },
  ];

  const flagged = sections.filter((section) => section.ids.length > 0);

  return (
    <Card as="section" className="flex flex-col gap-[var(--space-16)] text-start">
      <Heading level={2}>{t('beneficiaries.integrityTitle')}</Heading>
      <Text tone="mist">{t('beneficiaries.integrityIntro')}</Text>

      {flagged.length === 0 ? (
        <Chip
          tone="success"
          label={t('beneficiaries.integrityOk')}
          data-testid="qm-lineage-integrity-ok"
        />
      ) : (
        flagged.map((section) => (
          <section
            key={section.key}
            className="flex flex-col gap-[var(--space-8)] border-t border-line pt-[var(--space-16)]"
            data-testid={`qm-lineage-integrity-${section.key}`}
          >
            <Heading level={3}>{section.title}</Heading>
            <Text variant="body-sm" tone="mist">
              {section.body}
            </Text>
            <ul className="flex flex-wrap gap-[var(--space-8)]">
              {section.ids.map((id) => (
                <li key={id}>
                  <DiagnosticCode locale={locale} code={id} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Card>
  );
}
