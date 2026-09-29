/**
 * `compliance/contract.ts` — E7's vocabulary for the obligation TEMPLATE LIBRARY.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The **template library** of §09 Engine A: the ~30-cluster set of regulatory obligations a Nazir
 * owes, derived from `docs/domain/unified-framework.md`'s three workstreams, each carrying the gate
 * that decides which endowment classes it binds. It is the *library*, not the *register*: a
 * `ComplianceTask` is an INSTANCE of one of these rows against one endowment, and instantiation is
 * `../classification`'s job — {@link ../classification/gating.obligationsForClassification} already
 * consumes exactly this shape.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE LIBRARY IS CODE AND NOT ONLY A SEED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Before E7 the `compliance_obligation` table's rows were **derived backwards from fixture task
 * instances** (`packages/database/src/seed/map.ts`): one obligation per seeded task, ten rows, and a
 * semantic duplicate among them (two tasks with the same English title and gate produced two
 * obligation codes with different Arabic). Two consequences, and the second is fatal to the idea of
 * a register:
 *
 *  1. There was **structurally no way to express an obligation no endowment had a task for** — which
 *     is precisely what a library is. A register that can only contain duties somebody has already
 *     recorded cannot tell a Nazir what they have *missed*.
 *  2. Every totality claim about the catalogue needed a live database to be non-vacuous.
 *     `classification/__tests__/obligation-gating.test.ts` already says it in terms: *"An empty
 *     catalogue is a CALLER problem, not a gating one … Over an empty catalogue every contrast
 *     assertion in the API layer would pass while proving nothing."*
 *
 * So the library is a catalogue-as-code with two-direction totality proofs, following
 * `../ledger/accounts.ts`'s precedent (`assertCoversVocabulary`). The seed becomes a *projection* of
 * this file rather than its source — ⊕ **and since 2026-08-23 (S8/E7) it actually IS one**:
 * `packages/database/src/seed/map.ts`'s `deriveCanonicalObligations()` writes 36 of these 37 rows at
 * `libraryVersion` `2026-08-20.1`, beside the ten placeholders, which keep theirs.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE ARABIC IN THIS MODULE IS QUOTED, NEVER WRITTEN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `titleAr` on every row is a **byte-for-byte copy of one bullet** from
 * `docs/domain/unified-framework.md` — QMULATE's own Arabic-authoritative restatement of the Nazarah
 * regulation, and the document §09's library was derived from. `frameworkBullets` records the exact
 * bullet(s) each row covers, and `__tests__/catalogue-source-fidelity.test.ts` re-reads that file and
 * compares **character by character**, so a paraphrase cannot survive a test run.
 *
 * This is not caution for its own sake. `../classification/contract.ts` already states the rule for
 * these strings — *"Arabic-authoritative (NFR-01). Passed through untouched; this module writes no
 * copy"* — and the endowment screen gives the reason: **the catalogue is the regulation's own text
 * recorded as data, and translating it in a copy deck would put the product between a Nazir and the
 * law.** An obligation title is therefore a database column and NOT catalogue copy: these rows touch
 * no i18n parity test, and none should be added for them.
 *
 * ⚠ **A template that clusters several bullets still quotes ONE of them.** 37 templates cover 93
 * bullets, so most rows are clusters. `titleAr` is the PRIMARY bullet verbatim and
 * `frameworkBullets` lists the rest; the texts are never merged, because a merged sentence is a
 * sentence nobody in this repository is entitled to write.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ EVERY GATE, WINDOW AND CADENCE HERE IS UNVERIFIED AGAINST PRIMARY LAW
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Binding rule 3. `deadlineRuleKey` names a rule whose WINDOW lives in
 * `Setting['deadline.<key>.…']` and is never stored on an obligation; `gate` is a reading of which
 * classes a duty binds; `recurrence` is a reading of how often it recurs. {@link
 * COMPLIANCE_UNVERIFIED_NOTE} travels with every result, and no number appears in this file.
 */

import { UNVERIFIED_NOTE } from '../settings.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Vocabulary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `ComplianceSection` — the unified framework's three workstreams.
 *
 * Must equal `schema.prisma`'s `enum ComplianceSection` member-for-member;
 * `__tests__/compliance-parity.test.ts` reads the schema as text and compares. Declared HERE because
 * `../classification/contract.ts` deliberately left `section` as a bare `string` with the note *"E7
 * owns that vocabulary"* — this is E7 taking it.
 */
export const COMPLIANCE_SECTIONS = ['FINANCIAL', 'OPERATIONAL', 'GOVERNMENT_LEGAL'] as const;

export type ComplianceSection = (typeof COMPLIANCE_SECTIONS)[number];

/** Narrowing guard. A value from outside the set is reported by the caller, never coerced. */
export function isComplianceSection(value: string): value is ComplianceSection {
  return (COMPLIANCE_SECTIONS as readonly string[]).includes(value);
}

/**
 * How often an obligation recurs — §09's `Recurrence`.
 *
 * ⚠ **§09's OWN LIBRARY TABLE USES FIVE VALUES THIS TYPE CANNOT HOLD, AND THAT IS A SPEC DEFECT
 * RATHER THAN A GAP IN THIS TYPE.** Measured over the 37 rows: `per Shart / annual` (FIN-DIST-01),
 * `per run` (FIN-DIST-02), `once + annual review` (GOV-SHART-02), `quarterly / annual` (GOV-GEN-01)
 * and `annual review` (GOV-GOVN-02). §09 declares `Recurrence` as exactly
 * `once | annual | quarterly | monthly | event | ongoing` and then writes compound cadences into its
 * own table.
 *
 * Two of the five compress mechanically and are compressed here, with the reasoning recorded on the
 * row: `annual review` is `ANNUAL`, and `per run` is `EVENT` (the event being a distribution run).
 * The other three are **not** engineering's to resolve and are held in
 * {@link UNRESOLVED_RECURRENCE_SUBJECTS} instead of being flattened:
 *
 *  · `per Shart / annual` is a CONDITIONAL the deed decides, and the engine already models exactly
 *    that conditional elsewhere (§09 B5: the Shart's schedule governs, else FYE + 3 months).
 *  · `once + annual review` is arguably TWO obligations, and collapsing it has a compliance
 *    consequence: if one row carries both, completing the initial bylaws would close the annual
 *    review with it, and an unmet recurring duty would read as satisfied.
 *  · `quarterly / annual` is a genuine regulatory ambiguity about what Art. 10(3, 9) requires.
 *
 * Nothing is defaulted for those three. A default would be engineering answering a question about
 * the regulation — binding rule 4 — and the answer would then be invisible, because a cadence that
 * is merely *wrong* still produces a plausible-looking register.
 */
export const COMPLIANCE_RECURRENCES = [
  'ONCE',
  'ANNUAL',
  'QUARTERLY',
  'MONTHLY',
  'EVENT',
  'ONGOING',
] as const;

export type ComplianceRecurrence = (typeof COMPLIANCE_RECURRENCES)[number];

/** Narrowing guard for {@link ComplianceRecurrence}. */
export function isComplianceRecurrence(value: string): value is ComplianceRecurrence {
  return (COMPLIANCE_RECURRENCES as readonly string[]).includes(value);
}

/**
 * The library's phase, per the roadmap. Tracked from day one at every phase; only the WORKFLOW depth
 * differs (§09: *"Operational (§2) — Phase 3 workflow depth; templates tracked from day one"*).
 */
export const COMPLIANCE_PHASES = [1, 2, 3] as const;

export type CompliancePhase = (typeof COMPLIANCE_PHASES)[number];

/**
 * §09's own lowercase gate spelling → the `ClassificationGate` enum member.
 *
 * ⚠ **WHY THIS EXISTS AT ALL, because "just store the enum" was the wrong answer and "just store the
 * spec's string" was too.** §09's library table writes `all`, `large_medium`, `exclude_direct`,
 * `has_income`, `small_direct`; `schema.prisma` and `../classification` use SCREAMING_SNAKE. The
 * catalogue has to satisfy two masters:
 *
 *  · the **fidelity test** compares every cell against §09's own text, so the transcription has to be
 *    checkable against the lowercase source;
 *  · the **gating resolver** consumes these rows directly — that is the whole point of a
 *    catalogue-as-code — and `isClassificationGate('has_income')` is FALSE, so a lowercase row would
 *    land in `unrecognisedGate` and every one of §09's obligations would be reported as a mis-typed
 *    catalogue row.
 *
 * So the rows carry the ENUM spelling and this map is the declared bridge the fidelity test compares
 * THROUGH. Both directions are asserted: a spec spelling with no enum member fails, and an enum
 * member no spec spelling reaches fails too. Neither side can drift silently, which is the only
 * reason a second spelling is tolerable at all.
 */
export const GATE_FROM_SPEC: Readonly<Record<string, string>> = Object.freeze({
  all: 'ALL',
  large_medium: 'LARGE_MEDIUM',
  small_direct: 'SMALL_DIRECT',
  exclude_direct: 'EXCLUDE_DIRECT',
  has_income: 'HAS_INCOME',
  // ⚠ Retired by S8-Q3 and kept for the same reason the seed keeps its key: an old row carrying it
  // must reach the engine as a RECOGNISED gate so the engine can refuse it by name.
  large_only: 'LARGE_ONLY',
});

/** §09's spelling for an enum member — the reverse of {@link GATE_FROM_SPEC}, derived not restated. */
export const SPEC_FROM_GATE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(GATE_FROM_SPEC).map(([spec, gate]) => [gate, spec])),
);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The template shape
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * One bullet of `docs/domain/unified-framework.md`, cited so the Arabic can be re-verified.
 *
 * `subsection` + `ordinal` identify it stably across edits that move lines; `line` is the line number
 * as measured, kept because it makes a failure message actionable. The fidelity test uses the TEXT to
 * locate the bullet and reports the line only as a hint — a line number that drifted must not be able
 * to turn a real quote into a failure, nor a bad quote into a pass.
 */
export interface FrameworkBulletRef {
  /** e.g. `'3-4'` — the framework subsection. */
  readonly subsection: string;
  /** 1-based index of the bullet within its subsection. */
  readonly ordinal: number;
  /** Line number in `unified-framework.md` as measured when this row was written. A hint only. */
  readonly line: number;
}

/**
 * An obligation template — immutable within a library version.
 *
 * Assignable to `../classification`'s `GatedObligation`, which is the shape the gating resolver
 * consumes; the extra fields here are the provenance §09 requires and the database does not yet carry
 * (`libraryVersion`, `recurrence`, `phase`, `regulationRefs`, `brRefs`). That delta is declared, not
 * hidden — see {@link OBLIGATION_TEMPLATE_SCHEMA_DELTA}.
 */
export interface ObligationTemplate {
  /** Stable code, e.g. `'GOV-REG-02'`. Unique across the library; asserted. */
  readonly code: string;
  /** The library version this row belongs to. Templates are immutable WITHIN a version. */
  readonly libraryVersion: string;
  readonly section: ComplianceSection;
  /** The framework SUBSECTION heading, quoted. Arabic-authoritative (NFR-01). */
  readonly workstreamAr: string;
  readonly workstreamEn: string;
  /**
   * ⚠ BYTE-FOR-BYTE one bullet of `unified-framework.md`. Never composed.
   *
   * **NULL IS A REAL AND CORRECT VALUE, and exactly one row carries it.** `GOV-COI-01`
   * (conflict-of-interest disclosure; no self-dealing to the 2nd degree, Nazarah Art. 18) has **no
   * bullet anywhere in the framework** — measured, not assumed: a grep for
   * تعارض / المصالح الشخصية / الدرجة الثانية / إفصاح returns exactly one hit, §3-2's bullet about
   * reconciling CONFLICTING SHART CONDITIONS, which is a different duty entirely. §09 traces the row
   * to §3-6 and §3-6 contains nothing of the kind. So QMULATE's own framework does not restate Art. 18,
   * and the nearest neighbouring text (§3-6's bullet on the competence and trustworthiness of
   * appointees) is a different obligation already assigned to `GOV-GOVN-01`.
   *
   * A composed Arabic sentence here would be **inventing the wording of a self-dealing prohibition**
   * on a legal-facing screen. The null stands, {@link UNSOURCED_ARABIC_SUBJECTS} records why, and the
   * Arabic is owed to the same product-approved review path as the statement copy.
   */
  readonly titleAr: string | null;
  /** §09's own obligation text. */
  readonly titleEn: string;
  /** Every framework bullet this template covers; `[0]` is the one `titleAr` quotes. */
  readonly frameworkBullets: readonly FrameworkBulletRef[];
  /** `ClassificationGate` as a STRING, for the reason the classification contract gives. */
  readonly gate: string;
  /**
   * ⚠ **NULL when §09's cadence cell cannot be read as a single value** — three rows, listed in
   * {@link UNRESOLVED_RECURRENCE_SUBJECTS}. The row instantiates cadence-less rather than with a
   * guess, because a cadence that is merely wrong still produces a plausible-looking register and
   * nobody would ever re-examine it.
   */
  readonly recurrence: ComplianceRecurrence | null;
  /** Engine-B rule key, or `null`. The WINDOW is never stored here — binding rule 3. */
  readonly deadlineRuleKey: string | null;
  /**
   * ⚠ **NULL ON EVERY ROW, AND THAT IS THE SOURCE'S SILENCE RATHER THAN AN OMISSION HERE.**
   * §09 DECLARES `phase` on its `ObligationTemplate` interface and its library table has **no phase
   * column**. The two section headings talk about *workflow depth* — "Operational (§2) — Phase 3
   * workflow depth; templates tracked from day one", "Government & legal (§3) — Phase-1 heavy" —
   * which is a statement about when the WORKFLOW is built, not a per-row roadmap phase, and
   * "Phase-1 heavy" is explicitly not "all of Phase 1". Deriving a phase from a section heading
   * would turn a hedge into a fact on 37 rows. See {@link SOURCE_SILENT_FIELDS}.
   */
  readonly phase: CompliancePhase | null;
  /** ⚠ Null on every row — §09's table has no owner column. {@link SOURCE_SILENT_FIELDS}. */
  readonly defaultOwnerRole: string | null;
  /**
   * ⚠ Null on every row — §09's table has no reserved-matter column, and guessing this one is
   * worse than guessing the others: a `false` would assert that an obligation needs no
   * authority-gated approval, which is a claim about the governance chain.
   */
  readonly isReservedMatter: boolean | null;
  readonly regulationRefs: readonly string[];
  readonly brRefs: readonly string[];
  /**
   * Every open question about this row, as DATA rather than as a comment — so it reaches a caller, a
   * screen and a report instead of only a reader who happens to open this file.
   *
   * Empty for a fully-determined row. A row may carry more than one, from three distinct classes
   * with three distinct owners: {@link UNRESOLVED_RECURRENCE_SUBJECTS} (the product owner or
   * counsel), {@link UNRESOLVED_DEADLINE_BINDINGS} (E8/S9, which owns the deadline engine), and
   * {@link UNSOURCED_ARABIC_SUBJECTS} (the product-approved copy review).
   */
  readonly unresolved: readonly string[];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The markers that travel with every result
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ Every gate, cadence and deadline binding in this library is an UNVERIFIED reading of primary
 * Saudi law. Reuses `settings.ts`'s marker rather than spelling a second one — the repo already
 * carries two divergent `⚠ unverified` strings and that divergence is a reported item, not a
 * precedent to extend.
 */
export const COMPLIANCE_UNVERIFIED_NOTE = UNVERIFIED_NOTE;

/**
 * §09 table cells whose cadence this module REFUSES to flatten, with the reason.
 *
 * Keyed by template code. A row named here carries the same text in its `unresolved` field, so the
 * question reaches a caller and a screen rather than living in a comment somebody has to find.
 *
 * ⚠ `catalogue.test.ts` asserts this map and the catalogue agree in BOTH directions: a row named
 * here must carry `unresolved`, and a row carrying `unresolved` must be named here. The failure mode
 * otherwise is a question that quietly stops being asked.
 */
export const UNRESOLVED_RECURRENCE_SUBJECTS: Readonly<Record<string, string>> = Object.freeze({
  'FIN-DIST-01':
    '§09 records this cadence as `per Shart / annual` — a CONDITIONAL the deed decides, not a ' +
    "fixed cadence. The engine already models exactly this conditional (§09 B5: the Shart's " +
    'schedule governs; absent one, FYE + 3 months), so the recurrence recorded here is a ' +
    'placeholder for a rule that lives elsewhere. Flattening it to ANNUAL would assert a cadence ' +
    'for every deed that sets its own.',
  // ⊖ GOV-SHART-02 and GOV-GEN-01 LEFT this map on 2026-08-26 (S9-2, library 2026-08-26.1): the
  // owner ruled both cadences in the memo's fourth batch — S8-Q8a "two rows: ONCE + ANNUAL
  // review" (GOV-SHART-03 now carries the review) and S8-Q8b "annual + on-request" (on-request
  // access is conduct, not a schedulable task). Both owner-PROVISIONAL pending counsel; a
  // counsel reversal reshapes the rows as a NEW library version, never an edit.
  'FIN-MGT-05':
    "§09 records this cadence as `periodic + annual` because the framework bullet's OWN text is " +
    'compound (الدورية والسنوية — the periodic AND the annual statements, one duty). Flattening ' +
    'it to ANNUAL would silently drop the periodic half; splitting it invents a cadence for the ' +
    'periodic half no source states. The row instantiates cadence-less; with the owner. ' +
    '⚠ verify — may be stale (confirm vs primary law).',
});

/**
 * Rule keys a template BINDS that Engine B cannot yet resolve — E8/S9's debt, recorded on the row.
 *
 * ⚠ **MEASURED, both halves.** `Setting` defines a window for exactly FOUR keys
 * (`deadline.REGISTER_30BD.businessDays`, `deadline.UPDATE_15BD.businessDays`,
 * `deadline.ISTIBDAL_10BD.businessDays`, `deadline.DISTRIBUTE_3M_FYE.months`) while
 * `schema.prisma`'s `Deadline.ruleKey` documents NINE, so five documented keys resolve to nothing.
 * And `AML_IMMEDIATE`, which §09 binds to `GOV-AML-02`, is not among the nine at all.
 *
 * Nothing here is *fixed* by E7 — the deadline engine is E8's, and inventing a window would be
 * inventing a statutory figure (binding rule 3). What E7 owes is that the binding does not silently
 * dangle: an obligation whose deadline resolves to nothing must say so, or a register will show a
 * duty with no clock and read as compliant.
 *
 * ⚠ `AML_IMMEDIATE` may not be a rule key at all. §09's own Engine-C text says the AML report *"has
 * no statutory countdown — the duty is 'immediate' — so it is modelled as an event obligation whose
 * SLA is same-day, surfaced on the dashboard, not a business-day clock."* That reading is
 * **engineering's**, recorded here rather than acted on; S9 owns the resolution.
 */
export const UNRESOLVED_DEADLINE_BINDINGS: Readonly<Record<string, string>> = Object.freeze({
  // ⊖ SIX ENTRIES LEFT this map on 2026-08-26 (S9-2 — E8/S9 paying its recorded debt):
  //  · GOV-AML-01 (KYC_REFRESH), GOV-RGL-01 (LICENSE_RENEWAL), GOV-LEG-01 (CONTRACT_RENEWAL) and
  //    GOV-JUD-01 (HEARING) now RESOLVE — S9-1's rule vocabulary computes all four
  //    (`deadlines/rules.ts`), and S9-2 registered + seeded the windows/leads the first three
  //    needed (`kyc.refreshIntervalMonths` existed all along; HEARING is as-dated by design).
  //  · GOV-RGL-03 (RETENTION_10Y) and GOV-AML-02 (AML_IMMEDIATE) are resolved the OTHER way,
  //    exactly as this map's own notes anticipated: both are REFUSED AS NON-CLOCKS BY NAME
  //    (`DEADLINE_RULE_NOT_A_CLOCK` — RETENTION_FLOOR_NOT_A_CLOCK / AML_IMMEDIATE_NOT_A_CLOCK).
  //    The retention floor is the retention policy's (its figure: `retention.minimumYears`); the
  //    AML duty is a same-day event SLA surfaced on the dashboard — and a computed AML date in
  //    the general deadline plane would itself be a G-6 leak. The bindings STAY on the rows for
  //    provenance; the engine refuses to compute them, and that refusal is the design.
  'FIN-ZKT-01':
    "§09's Deadline cell for this row is the word `external`, which is not a rule key and names no " +
    'clock this system owns. Recorded as unbound rather than mapped to something plausible — and ' +
    'the underlying zakat question (Q10) is still open with the Sharia review.',
});

/**
 * Rows whose Arabic is NOT fully sourced from the framework, and what is missing.
 *
 * ⚠ **THIS IS THE MOST IMPORTANT MAP IN THE FILE**, because its failure mode is silent: a row with
 * plausible Arabic looks finished. Both entries were found by trying to transcribe and failing,
 * then verifying the failure with a grep rather than accepting it.
 */
export const UNSOURCED_ARABIC_SUBJECTS: Readonly<Record<string, string>> = Object.freeze({
  'GOV-COI-01':
    'NO BULLET IN `unified-framework.md` STATES THIS OBLIGATION. Measured: a grep for ' +
    "تعارض / المصالح الشخصية / الدرجة الثانية / إفصاح returns one hit, §3-2's bullet about " +
    'reconciling CONFLICTING SHART CONDITIONS — a different duty. §09 traces the row to §3-6, and ' +
    "§3-6 restates nothing of the kind, so QMULATE's own framework does not carry Nazarah " +
    'Art. 18. `titleAr` is therefore NULL: composing one would be inventing the wording of a ' +
    'self-dealing prohibition. Owed to the product-approved copy review, not to a code change. ' +
    '⊕ Worth surfacing on its own: the FRAMEWORK has a gap, not just this catalogue.',
  'GOV-RGL-03':
    'The quote is verbatim and is a genuine records-and-archiving duty (§3-9), but it is NOT ' +
    "Arabic authority for this row's HEADLINE NUMBERS. Measured: the ≥10-year floor appears " +
    'NOWHERE in `unified-framework.md` — the only "10" in the file is the §3-10 heading — and ' +
    '"rapid retrieval" has no §3 anchor either (the nearest wording, §1-1\'s ' +
    'بما يضمن سهولة الرجوع إليها, is in the FINANCIAL section and belongs to the accounting-records ' +
    'template). The figure comes from Nazarah Art. 20 and is UNVERIFIED (binding rule 3), which is ' +
    'why it must stay a configurable `Setting` and never a hardcoded 10. ' +
    '⚠ verify — may be stale (confirm vs primary law).',
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE TEN DUTIES §09's LIBRARY DOES NOT TRACK — the most important finding in this module
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09's library is described as *"derived 1:1 from the unified framework's three sections"*. It is
 * not. **MEASURED: 83 of the framework's 93 bullets are covered by a template; 10 are covered by
 * nothing**, so a register built from this library will never raise a task for them. Every one is a
 * duty QMULATE's own document says the Nazir owes.
 *
 * This was found by transcribing — the cheapest way to discover a document is incomplete — and then
 * confirmed twice: by an adversary told to refute the mapping, and by a mechanical set difference.
 * It is recorded as DATA and pinned by `catalogue-source-fidelity.test.ts` in BOTH directions: a
 * bullet that becomes uncovered fails the test, and a bullet that becomes covered forces its entry
 * out. So the gap cannot widen silently and cannot be quietly declared closed.
 *
 * ⚠⚠ **READ `1-3#6` FIRST. It is the duty the DISTRIBUTION ENGINE'S OWN REFUSAL HANDS OFF TO.**
 * Binding rule 1 says that on `SHART_INCOMPLETE` the engine halts and *"resolution goes to the
 * condition-interpretation path (living waqif, else the competent authority), never to code"*. The
 * framework states exactly that duty in Arabic — observe the waqif's intent where the beneficiary is
 * unnamed or the naming lapses, **and refer to the competent authority to determine it** — and §09's
 * library has no row for it. So the engine can refuse to compute, correctly, and the compliance
 * register has nowhere to record the obligation that refusal creates. That is not a missing checkbox:
 * it is the handoff at the end of the product's most important refusal.
 *
 * ⚠ Three of the ten (`3-3#1`, `3-3#4`, and arguably `1-1#7`) are defensibly UMBRELLA STANDARDS
 * rather than taskable obligations — "comply with Sharia and the regulations", "exercise due care".
 * The disposition is recorded per entry so the judgement is visible; it is **not** engineering's
 * call which of the ten the library should gain, because that is a question about which duties the
 * regulation imposes as trackable work. Surfaced, not resolved (binding rule 4).
 */
export const FRAMEWORK_BULLETS_WITHOUT_TEMPLATE: Readonly<Record<string, string>> = Object.freeze({
  // ⊕ 2026-08-26 (S9-2, library 2026-08-26.1): the owner RULED this list (S8-Q9, memo fourth
  // batch — "minimum three become templates; the remaining seven are recorded as deliberate
  // non-coverage with reasons"). 1-2#2 → FIN-MGT-05, 1-3#6 → FIN-DIST-03 and 3-3#2 → GOV-GEN-04
  // LEFT the list as tracked; the seven below are now DELIBERATE non-coverage by that ruling,
  // each keeping the reason it is defensible (or the cost of the gap) on the record.
  '1-1#5':
    "DELIBERATE NON-COVERAGE (S8-Q9) — organising and keeping the waqf's accounting records, " +
    'entries and vouchers regularly, "so they are easy to refer back to". The retrieval standard ' +
    '`GOV-RGL-03`\'s English claims ("rapid retrieval") has its ONLY textual anchor here, in the ' +
    'FINANCIAL section — the cost of not tracking it is that anchor staying untracked.',
  '1-1#7':
    "DELIBERATE NON-COVERAGE (S8-Q9), ARGUABLY UMBRELLA — keeping the waqf's documents and " +
    'financial correspondence in order. Overlaps `GOV-RGL-03` (retention) and `1-1#5`; a ' +
    'reasonable library might fold it into either, and the ruling records it unfolded.',
  '1-2#4':
    'DELIBERATE NON-COVERAGE (S8-Q9) — monitoring cash inflows and outflows and producing ' +
    'liquidity / obligations / amounts-due statements. No template covers it at any ' +
    'classification; partially adjacent to the new `FIN-MGT-05` (statements) without being it.',
  '1-2#5':
    'DELIBERATE NON-COVERAGE (S8-Q9) — periodic financial reports RAISED TO THE FIRST PARTY. ' +
    "§09's reporting templates report to the BENEFICIARIES (`GOV-GEN-01`); reporting up and " +
    'reporting out are different duties to different parties, and the up-report stays untracked.',
  '1-4#2':
    'DELIBERATE NON-COVERAGE (S8-Q9) — communicating and coordinating with government bodies, ' +
    'regulators, BANKS and related parties on financial and accounting matters. `GOV-RGL-02` ' +
    'covers government-platform transactions under §3-9; it does not reach banks at all.',
  '3-3#1':
    'DELIBERATE NON-COVERAGE (S8-Q9), UMBRELLA STANDARD — complying with Sharia, the laws and ' +
    "whatever the Authority issues. Defensibly not a task. ⚠ §09's traces still claim " +
    "`GOV-GEN-01/02/03` cover §3-3 while two of that subsection's bullets are covered by none " +
    'of them (down from three: 3-3#2 is now `GOV-GEN-04`).',
  '3-3#4':
    "DELIBERATE NON-COVERAGE (S8-Q9), UMBRELLA STANDARD — the care needed to achieve the waqf's " +
    'benefit and advantage (المصلحة والغبطة). A standard rather than a task, though it is the one ' +
    "`GOV-GOVN-01`'s cluster leans on.",
});

/**
 * Templates whose covered bullets deliberately span MORE subsections than §09 traces them to.
 *
 * The fidelity test constrains the PRIMARY bullet strictly — a quote must come from the traced
 * subsection — and requires any wider coverage to be declared here. Strict where the quote is,
 * declared where the coverage is genuinely wider, so neither a mis-mapping nor an honest span can
 * pass unnoticed.
 */
export const CROSS_SUBSECTION_COVERAGE: Readonly<Record<string, string>> = Object.freeze({
  'GOV-RGL-03':
    'Archiving duties are restated in three places, in near-identical Arabic: §3-6 (legal and ' +
    'administrative documents), §3-7 (contracts and legal documents) and §3-9 (decisions, minutes ' +
    'and records — the primary, and the one §09 traces). Covering all three is the honest reading; ' +
    'each is the same duty seen from a different workstream.',
});

/**
 * Read one open-question reason out of its map, by code.
 *
 * ⚠ **THROWS when the code is absent, and that is the point.** `catalogue.ts` composes each row's
 * `unresolved` array from these maps, and the obvious spelling — `MAP[code]!` — would put `undefined`
 * into a shipped array the day somebody deleted a map entry without touching the row. The array is
 * the mechanism that carries an open question to a caller and a screen; a silent `undefined` in it is
 * exactly the failure the both-directions test exists to prevent, arriving one layer earlier than the
 * test can see. Failing at module load, by name, is the honest alternative to a non-null assertion.
 */
export function questionReason(
  map: Readonly<Record<string, string>>,
  code: string,
  which: string,
): string {
  const reason = map[code];
  if (reason === undefined)
    throw new Error(
      `compliance catalogue: ${code} claims a ${which} question, but ${which} has no entry for it. ` +
        'Either restore the entry or remove the claim from the row — a row referencing a deleted ' +
        'reason would carry `undefined` to every caller.',
    );
  return reason;
}

/**
 * What `ObligationTemplate` carries that `compliance_obligation` does not — the DECLARED delta,
 * because the engine leading the schema is only acceptable when the lead is written down.
 *
 * The sanctioned mechanism for this is `prisma-vocabulary-parity.test.ts`'s `PENDING_MIGRATION`
 * bucket; this list is its compliance-side twin and `__tests__/compliance-parity.test.ts` asserts
 * every name in it is genuinely ABSENT from `schema.prisma`. So the day a migration adds one, the
 * test fails and the entry has to come out — a stale "we still owe this" is as misleading as a
 * missing one.
 */
export const OBLIGATION_TEMPLATE_SCHEMA_DELTA: readonly string[] = Object.freeze([
  // ⊖ `libraryVersion` LEFT THIS LIST on 2026-08-23 — it shipped in migration 31 by the owner's S8-Q5
  // ruling, and the parity test asserts every name here is genuinely ABSENT from the schema, so a
  // delta naming a shipped column FAILS. That is the mechanism working: a declared debt that turns
  // red when it is paid is the only kind that gets deleted rather than forgotten.
  'recurrence',
  'phase',
  'regulationRefs',
  'brRefs',
]);

/**
 * Fields §09's `ObligationTemplate` interface DECLARES and its library table never populates.
 *
 * ⚠ **Every one is `null` on every row, and `catalogue.test.ts` asserts that** — because the
 * tempting move here is the wrong one. Each of these four has an obvious-looking default, and each
 * default would be engineering asserting a regulatory or governance fact that no source states:
 *
 *  · `phase` — derivable-looking from the section headings, which actually speak about *workflow
 *    depth* and say "Phase-1 **heavy**", a hedge rather than a value.
 *  · `defaultOwnerRole` — the RACI is in `docs/company/operating-model.md`, and mapping 37
 *    obligations onto it is a separate act of judgement, not a transcription.
 *  · `isReservedMatter` — a `false` here would assert that an obligation needs no authority-gated
 *    approval. `ReservedMatterKind` has eight members and **not one is compliance-shaped**, with the
 *    schema warning that "borrowing one of the seven would be a mislabelled authority, which is
 *    worse than an unlabelled one".
 *  · `libraryVersion` — populated, but from THIS module rather than from §09: it is a fact about
 *    the catalogue's own release, and it is the one of the four that is ours to state.
 *
 * A null that is tested is a recorded absence. A default that looks plausible is an invented fact
 * nobody will ever re-examine.
 */
export const SOURCE_SILENT_FIELDS: readonly string[] = Object.freeze([
  'phase',
  'defaultOwnerRole',
  'isReservedMatter',
]);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · What the REGISTER must compartment — S8-Q1, as data
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The obligation TEMPLATES whose register row is itself inside the AML compartment.
 *
 * ⊕ **Owner ruling S8-Q1 (2026-08-23), verbatim selection: *"Compartment the row (Recommended)."***
 * Recorded in `docs/product/prd/S4-owner-decision-memo.md`'s S8 addendum. The `GOV-AML-02` obligation
 * row and its status changes are visible ONLY inside the AML compartment; the general register shows
 * nothing AML-attributable. ⚠ This DEPARTS from §09's literal text (the row on the general register
 * at gate `all`), which is now the drifted side and owes a supersession note. *(Counsel caveat, from
 * the memo: Saudi AML no-tipping-off law; the owner is a practising Nazir, not counsel.)*
 *
 * ── WHY THE LIST LIVES HERE AND NOT IN THREE OTHER PLACES ────────────────────────────────────
 *  · **Not in `catalogue.ts`.** That file's standing rule is that NOTHING in it is authored — every
 *    cell is transcribed from §09 or quoted from the framework, and the fidelity suite compares it
 *    character by character. This classification comes from the OWNER, not from either source, and
 *    §09 says the opposite. Putting it on the transcribed rows would make the catalogue a place
 *    where a ruling and a quotation are indistinguishable.
 *  · **Not inside the seed.** Migration 32 rejected exactly that shape one level down: a security
 *    control keyed on a literal `code` inside one writer un-compartments the duty the first time
 *    S8-Q5's versioning republishes it under a new row. Declared once, projected by every writer.
 *  · **Not in `disclosure.ts`.** That module is deliberately catalogue-blind — it answers "may this
 *    payload leave", given a classification. This answers "what classification does this row carry",
 *    which is a fact about the library.
 *
 * ⚠ **THE DANGEROUS DIRECTION IS A TYPO, NOT AN OMISSION.** A code misspelled here does not fail
 * loudly — it silently classifies nothing, and `GOV-AML-02` seeds `NORMAL`, which is the leak S8-Q1
 * exists to close, wearing a green test suite. `catalogue.ts` therefore refuses to LOAD if any code
 * here is absent from the library, and the AML suite pins the membership by name in both directions.
 */
export const AML_RESTRICTED_TEMPLATE_CODES: readonly string[] = Object.freeze(['GOV-AML-02']);

const AML_RESTRICTED_TEMPLATE_SET: ReadonlySet<string> = new Set(AML_RESTRICTED_TEMPLATE_CODES);

/**
 * The `Confidentiality` a template's register row must carry — total over every string.
 *
 * ⚠ **AN UNKNOWN CODE ANSWERS `NORMAL`, AND THAT IS THE CORRECT DIRECTION HERE** even though this
 * repository's habit is to fail closed. Fail-closed for a *classification* would mean answering
 * `AML_RESTRICTED` for anything unrecognised, which would compartment the entire register the first
 * time a code was mistyped — hiding thirty-six ordinary duties from the compliance board and
 * breaking the register rather than protecting anything. The fail-closed obligation is discharged
 * one layer up instead, where it belongs: the set is validated against the library AT MODULE LOAD,
 * so an unrecognised code cannot reach this function in the first place.
 */
export function templateConfidentiality(code: string): 'NORMAL' | 'AML_RESTRICTED' {
  return AML_RESTRICTED_TEMPLATE_SET.has(code) ? 'AML_RESTRICTED' : 'NORMAL';
}
