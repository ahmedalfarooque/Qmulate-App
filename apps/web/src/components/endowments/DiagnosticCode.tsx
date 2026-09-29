import { getTranslations } from 'next-intl/server';

import { Mono, Well } from '@qmulate/ui';

/**
 * DiagnosticCode — a machine code shown AS a machine code, on purpose.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS COMPONENT EXISTS INSTEAD OF A TRANSLATION
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The distribution engine refuses with one of twenty-six `SHART_REFUSALS` discriminators
 * (`CONTINUATION_STIPULATION_UNRECOGNISED`, `LINEAGE_LINK_MISSING`, …). Their ar/en statement copy
 * is PRODUCT-APPROVED LEGAL TEXT that a beneficiary may dispute before the Authority; it is owned
 * by E10/E12 and must not be invented in a code change. The same holds for every exclusion-reason
 * and entitlement-rule code — `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` above all, whose Arabic must
 * not read as permanent when the exclusion reverses on an ancestor's death.
 *
 * So the screens show the ONE catalogued sentence for a halt (`errors.domain.SHART_INCOMPLETE`) and
 * render the discriminator beside it as an untranslated code an operator can quote in a ticket.
 * Inventing a plausible sentence per discriminator would be worse than showing the code: it would
 * put unapproved legal wording in front of a beneficiary and look finished while doing it.
 *
 * ⊕ M1-a/M1-b UPDATE — a SUBSET of the exclusion-reason and entitlement-rule codes now HAS
 * product-approved ar/en copy (the drafter's ANSWERED brief, wired verbatim and byte-locked by the
 * i18n fidelity suite). Those render their approved sentence WITH this component beside them
 * (`LinesPanel`'s `StatementWithCode`, via `statement-copy.ts` — consumption, never authorship).
 * The rest — the owed register (7 codes at M1-b) and all twenty-six SHART_REFUSALS discriminators —
 * still render through this component ALONE, for the reasons above.
 *
 * TODO(surface): the owed-register codes and the SHART_REFUSALS discriminators still have NO ar/en
 * statement copy. E10/E12 and the drafter's follow-up round own that text. Until it exists, each of
 * them renders through this component.
 *
 * ── The rendering rules it inherits ───────────────────────────────────────────────────────
 * Geist Mono, tabular, and LTR-isolated inside a `<bdi>` — a `SCREAMING_SNAKE` code must not
 * reorder itself against the surrounding Arabic prose. `common.diagnosticCode` supplies the
 * accessible name, so a screen reader announces "diagnostic code" before spelling it out rather
 * than reading a bare identifier.
 */
export async function DiagnosticCode({
  locale,
  code,
}: {
  readonly locale: string;
  readonly code: string;
}) {
  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    // An inset well is where a code or a figure belongs in this system (DESIGN.md §6). The inset
    // shadow comes from <Surface> underneath <Well>; nothing here writes one.
    <Well
      as="span"
      padded={false}
      data-testid="qm-diagnostic-code"
      className="inline-flex max-w-full items-center px-[var(--space-8)] py-[var(--space-4)]"
    >
      <span className="sr-only">{`${t('diagnosticCode')}: `}</span>
      <Mono size="body-sm" tone="mist" className="break-all">
        {code}
      </Mono>
    </Well>
  );
}
