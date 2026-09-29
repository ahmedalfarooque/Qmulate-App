import { getNamespace, resolveLocale } from '@qmulate/i18n';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE M1-a APPROVED STATEMENT COPY, CONSUMED — NEVER RESTATED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Since M1-a (`027efe9` — the drafter's ANSWERED wording brief, transcribed machine-to-machine
 * into `docs/product/statement-copy/APPROVED-WORDING.md` and wired VERBATIM into the ar/en
 * catalogues under `distribution.entitlementRule` / `distribution.exclusionReason` /
 * `distribution.withheldReason`), a SUBSET of the Tier-1 statement codes carries
 * product-approved wording. This module is the ONE place a render site asks "does this code
 * have an approved sentence?", and it answers by reading the catalogue — never by keeping its
 * own list, because a second list is a second author.
 *
 * ── The fallback contract ──────────────────────────────────────────────────────────────────
 * A code WITHOUT a catalogue entry renders as a bare machine code through `<DiagnosticCode>`,
 * exactly as before M1-a. That fallback set is not this module's to define: the i18n suite's
 * PARTITION LAW (`code-source-parity.test.ts` — approved-subset ⊎ owed-register = engine
 * contract, per group) pins that the codes this lookup misses are precisely the owed register's
 * (7 at M1-b), so a sentence appearing here without the drafter's round — or one silently
 * dropping out — is a red i18n test, not a quiet render change. The wording itself is
 * byte-locked to the provenance document by `approved-wording-fidelity.test.ts`; a correction
 * arrives only as a drafter re-issue through that chain, never as an edit here or in the
 * catalogue.
 *
 * ── Which group answers for which field ────────────────────────────────────────────────────
 *  · `line.basis.rule`  → `distribution.entitlementRule` (the BR-505 statement's basis line).
 *  · `line.reasonCode`  → `distribution.exclusionReason` when the code is an exclusion, else
 *    `distribution.withheldReason` when it is a gate/withheld code (the STATEMENT voice —
 *    deliberately distinct from the `errors.domain.*` toast voice, per the brief's own
 *    commissioning). The two groups share no member, so first-match is not an ordering choice.
 *
 * ⚠ `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`'s approved Arabic deliberately does not read as
 * permanent (the exclusion reverses on the blocking ancestor's death). That nuance lives in the
 * approved text; nothing here may paraphrase it.
 */
const STATEMENT_GROUPS = ['exclusionReason', 'withheldReason'] as const;

type DistributionNamespace = Record<string, unknown>;

function groupOf(locale: string, group: string): Record<string, string> {
  const distribution: DistributionNamespace = getNamespace(resolveLocale(locale), 'distribution');
  const candidate = distribution[group];
  // The catalogue groups are flat string records; anything else means the catalogue moved and
  // the safe answer is "no approved sentence" (the code still renders via <DiagnosticCode>).
  if (candidate === null || typeof candidate !== 'object') return {};
  return candidate as Record<string, string>;
}

/** The approved statement sentence for an entitlement-rule code, or `null` (Tier-1 fallback). */
export function entitlementRuleSentence(locale: string, code: string): string | null {
  const group = groupOf(locale, 'entitlementRule');
  return Object.hasOwn(group, code) ? (group[code] ?? null) : null;
}

/** The approved statement sentence for a line's reason code, or `null` (Tier-1 fallback). */
export function reasonSentence(locale: string, code: string): string | null {
  for (const groupName of STATEMENT_GROUPS) {
    const group = groupOf(locale, groupName);
    if (Object.hasOwn(group, code)) return group[code] ?? null;
  }
  return null;
}
