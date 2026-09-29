/**
 * `code-source-parity.test.ts` — the machine codes are **PARSED FROM SOURCE**, never hand-listed.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS: V-E3-M5, AND THE SHAPE OF THE HOLE IT CLOSES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Three mechanisms already compare code vocabularies against these catalogues, and **all three
 * compare a list somebody typed**:
 *
 *   1. `test/messages.test.ts` · `CODE_KEYED_GROUPS` — a hand-maintained member list per group;
 *   2. `test/messages.test.ts` · `CODE_LIST_SOURCES` — parsed, but only for the two `errors.*` lists;
 *   3. `packages/domain/src/eligibility/__tests__/eligibility-i18n-parity.test.ts` — imports
 *      `ELIGIBILITY_REASON_CODES`, so it can only see codes the DOMAIN declares.
 *
 * A code that is emitted but never added to a list is therefore **invisible to every one of them**,
 * and that is not hypothetical. **MEASURED on 2026-08-16, before this file existed:**
 * `packages/api/src/routers/deed.ts` emits `REP_ELIGIBILITY_WITHOUT_REPRESENTATIVE` and
 * `REP_ELIGIBILITY_NOT_ASSESSED` into `DomainError.details.reasons`; both catalogues have **zero**
 * occurrences of either string; and `pnpm --filter @qmulate/i18n exec vitest run` was **115/115
 * green** while `pnpm run i18n:check` reported **239 references resolve**. Nothing was red. The
 * codes reach `EligibilityPanel.tsx`, fail `isKnownVocab('eligibilityReason', …)`, and render to a
 * Nazir as a bare Latin machine code beside "this reason has no wording in this build" — while
 * §17's E3 exit clause asks for a **clear reason**, in Arabic, which is authoritative (NFR-01).
 *
 * So this file derives the expected members **from the declaring source file** for every
 * code-keyed group, and an emitted code with no copy fails a test instead of shipping.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ DO NOT WRITE THE COPY — AND DO NOT LEAVE THE SUITE RED EITHER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The ar/en wording for those two codes is product-approved legal text a beneficiary may dispute
 * before the Authority; it belongs to **E10/E12 with a review path**, and CLAUDE.md's binding rule 4
 * plus S4's standing instruction both forbid inventing it in a code change.
 *
 * Round 1 expressed that by letting the assertion FAIL on purpose. That was honest for one commit and
 * corrosive after two: "the suite is red on purpose" is indistinguishable, at a glance and in CI, from
 * "the suite is always red", and the next genuine omission arrives into a build nobody trusts. A
 * deliberate failure is also not a record — it lives in a diff, not in a list somebody can read.
 *
 * So the debt is carried the way this repo carries every other known, owed debt: as an **EXPLICIT
 * OWED REGISTER** (`COPY_OWED_TO_REVIEW`, §6), not a skip and not a red test. The register is a named
 * list of codes, each with the reason its wording cannot be typed here and the epic that owns it, and
 * it is enforced in FOUR directions so it cannot become a place to hide things:
 *
 *   1. a code with no copy that is **not** on the register FAILS — a NEW omission still breaks the
 *      build, which is the entire purpose of the mechanism;
 *   2. a code **on** the register that HAS copy now FAILS — when E10/E12 lands the wording, the test
 *      tells you to delete the entry, so the register cannot rot into a permanent exemption list;
 *   3. a code on the register that nothing emits any more FAILS — a dead entry is also rot;
 *   4. the register asserts **non-empty**, and names what is owed in its own test title and on stderr,
 *      so the debt is read aloud in every run's output instead of being silently carried.
 *
 * The register closes, entry by entry, when (a) the copy is authored and approved by that path, or
 * (b) the api stops emitting the code. Never by a sentence typed into this repo to make a suite green.
 * When the last entry goes, direction 4 fails and tells you to delete the register itself.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * READ AS TEXT, NOT IMPORTED — AND PARSED INDEPENDENTLY OF `messages.test.ts`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `@qmulate/{api,domain,database}` all sit ABOVE `@qmulate/i18n` in the dependency direction §17
 * fixes (`apps → api → {…, i18n} → config`), so importing any of them here would make the workspace
 * graph circular. Reading the declaration as text is the discipline already established by
 * `messages.test.ts` (which parses `packages/domain/src/errors.ts`), `packages/auth`'s role test and
 * `prisma-vocabulary-parity.test.ts` (both of which parse `schema.prisma`): the artefact under review
 * is the file a developer edits, and a text read cannot be satisfied by a stale build artefact.
 *
 * The parsers here are written from scratch rather than shared with `messages.test.ts` **deliberately**:
 * two guards over one failure mode are only two guards while a single bug cannot blind both. Every
 * parser throws — loudly, with instructions — when its declaration is missing, and every parse is
 * floored, because an assertion over an empty set is worth nothing.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { locales, type Locale } from '../src/config';

/** `packages/i18n/test/` → the repo root. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Where each vocabulary is DECLARED. A moved file must fail loudly, not silently pass. */
const SOURCE_FILES = {
  schema: `${REPO_ROOT}packages/database/prisma/schema.prisma`,
  /** ⊕ S11 · 2b — the compliance board's three declaring sources (E10). */
  deadlineRules: `${REPO_ROOT}packages/domain/src/deadlines/rules.ts`,
  boardState: `${REPO_ROOT}packages/domain/src/deadlines/board-state.ts`,
  /**
   * ⊕ S11 · 2b — `KpiTone`. The tone word is the FIGURE in each chip's well (`KpiStrip`), not a
   * decoration, so it is parsed off its declaration like every other rendered vocabulary rather
   * than trusted to a hand-list.
   */
  complianceBoard: `${REPO_ROOT}packages/api/src/compliance-board.ts`,
  eligibilityContract: `${REPO_ROOT}packages/domain/src/eligibility/contract.ts`,
  deedRouter: `${REPO_ROOT}packages/api/src/routers/deed.ts`,
  beneficiaryRouter: `${REPO_ROOT}packages/api/src/routers/beneficiary.ts`,
  reservedMatterRouter: `${REPO_ROOT}packages/api/src/routers/reservedMatter.ts`,
  /**
   * ⊕ S7 · the distribution engine's own vocabulary — twenty-seven `export const … as const`
   * arrays, of which the run wizard, the maker/checker panel, the approvals queue and the
   * dashboard tiles render sixteen.
   *
   * ⚠ EVERY ONE of them is CLASSIFIED below ({@link VOCABULARY_DISPOSITION}), not just the
   * sixteen. The failure this closes is the same shape as V-E3-M5 one level up: before S7 this
   * file derived twenty-one groups and NOT ONE from this file, so the whole distribution
   * vocabulary was invisible to every parity mechanism in the repo — MEASURED, the S7 router
   * landed with `flags`, `invariantsChecked`, per-line `reasonCode` and eleven mapping
   * diagnostics crossing to the UI and `pnpm --filter @qmulate/i18n exec vitest run` stayed
   * 220/220 green.
   */
  distributionContract: `${REPO_ROOT}packages/domain/src/distribution/contract.ts`,
  /**
   * ⊕ S7 · the API mapping layer's own two vocabularies (`MAPPER_REFUSALS`,
   * `MAPPING_DIAGNOSTICS`). Its own header names this file as the thing that must reach them:
   * *"nothing today notices these codes at all"*.
   *
   * ⚠ It is NOT under `routers/`, so the router-directory scan below cannot see it. That is
   * precisely why it is named here as well.
   */
  distributionRefusal: `${REPO_ROOT}packages/api/src/distribution/refusal.ts`,
} as const;

/**
 * The whole router DIRECTORY is scanned for emission sites, not just today's emitter.
 *
 * A reason code emitted from a router nobody thought to list is the same failure V-E3-M5 was: the
 * mechanism has to reach files that do not exist yet. Reading the directory is what makes that true.
 */
const ROUTERS_DIR = `${REPO_ROOT}packages/api/src/routers`;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The parsers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Removes `/* … *\/` and `// …` (and Prisma's `/// …`) BEFORE anything else is matched.
 *
 * Both source languages document every member in prose that quotes code in backticks, quotes
 * English in double quotes, and contains apostrophes ("the deed's two sides") that would otherwise
 * open a phantom string while scanning for a balanced bracket.
 *
 * ⚠ HONEST LIMIT: a `//` inside a string literal (a URL) truncates that line. Neither of the four
 * declared source files contains one, and the floors below would catch it if one ever swallowed a
 * declaration.
 */
function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/**
 * The text between `source[openIndex]` and its matching close, quote-aware.
 *
 * Call it on COMMENT-STRIPPED source: prose apostrophes are the failure mode it cannot survive.
 */
function sliceBalanced(source: string, openIndex: number, open: string, close: string): string {
  if (source[openIndex] !== open) {
    throw new Error(
      `sliceBalanced: index ${openIndex} is ${String(source[openIndex])}, not ${open}`,
    );
  }
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i] as string;
    if (quote !== null) {
      if (char === '\\') {
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  throw new Error(`sliceBalanced: no matching ${close} for the ${open} at index ${openIndex}`);
}

/** `enum Name { A B }` out of `schema.prisma`. */
function parsePrismaEnum(schema: string, name: string): string[] {
  const stripped = stripComments(schema);
  const declaration = new RegExp(`\\benum\\s+${name}\\s*\\{`);
  const match = declaration.exec(stripped);
  if (match === null) {
    throw new Error(
      `could not find "enum ${name}" in schema.prisma — it was renamed or removed. Fix this parser ` +
        `(or the group's source) rather than deleting the assertion: it is the only thing keeping the ` +
        `ar/en labels of that enum in step with the enum itself.`,
    );
  }
  const body = sliceBalanced(stripped, match.index + match[0].length - 1, '{', '}');
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
}

/**
 * A machine-code literal, as it appears in a source array.
 *
 * ⚠ THE HYPHEN IS LOAD-BEARING AND WAS MISSING UNTIL S7. This pattern read `[A-Z][A-Z0-9_]*`,
 * which cannot match `I-C1`, `I-L1` or `I-R1` — so `INVARIANT_IDS` parsed as **nine** members
 * instead of twelve, and every assertion built on it would have demanded copy for `I1`–`I9` and
 * reported success about the three that carry the corpus (`I-C1`), per-capita (`I-L1`) and
 * reversion (`I-R1`) guarantees. MEASURED both ways in the S7 stage that widened it: 9 → 12.
 *
 * That is the failure mode this whole file exists to prevent, produced by its own parser: a parse
 * that silently returns a SUBSET reports its blindness as a pass. The floors below are what would
 * eventually catch a parse that returned nothing; nothing catches a parse that returns most of it,
 * so the pattern has to be right.
 */
const CODE_LITERAL = /'([A-Z][A-Z0-9_-]*)'/g;

/** `export const NAME = ['A', 'B'] as const;` out of a TypeScript source. */
/**
 * ⊕ S11 · 2b — `BOARD_STATES` carries §09's LOWERCASE lifecycle words (`pending`, `due_soon`, …), which
 * {@link CODE_LITERAL} deliberately does not match. This sibling matches a lowercase identifier literal
 * and is used for exactly that one declaration; everything else stays on the uppercase pattern.
 */
const WORD_LITERAL = /'([a-z][a-z0-9_]*)'/g;

function parseWordConstArray(source: string, constName: string): string[] {
  const stripped = stripComments(source);
  const declaration = new RegExp(`\\bexport const ${constName}\\s*=\\s*\\[`);
  const match = declaration.exec(stripped);
  if (match === null) {
    throw new Error(
      `could not find "export const ${constName} = [" — the declaration was renamed or reformatted. ` +
        `Fix this parser rather than deleting the assertion.`,
    );
  }
  const body = sliceBalanced(stripped, match.index + match[0].length - 1, '[', ']');
  return [...body.matchAll(WORD_LITERAL)].map((literal) => literal[1] as string);
}

function parseConstArray(source: string, constName: string): string[] {
  const stripped = stripComments(source);
  const declaration = new RegExp(`\\bexport const ${constName}\\s*=\\s*\\[`);
  const match = declaration.exec(stripped);
  if (match === null) {
    throw new Error(
      `could not find "export const ${constName} = [" — the declaration was renamed or reformatted. ` +
        `Fix this parser rather than deleting the assertion.`,
    );
  }
  const body = sliceBalanced(stripped, match.index + match[0].length - 1, '[', ']');
  return [...body.matchAll(CODE_LITERAL)].map((literal) => literal[1] as string);
}

/**
 * Every `export const NAME = [ … ] as const;` NAME in a source — the vocabularies a file DECLARES.
 *
 * This is what makes the S7 mechanism generalise instead of being sixteen hand-written entries: a
 * NEW vocabulary added to the engine's contract appears here on the next run and fails
 * {@link VOCABULARY_DISPOSITION}'s classification test until somebody says what it is. A
 * hand-listed set of groups could only ever cover the vocabularies that existed when it was typed,
 * which is V-E3-M5's lesson stated at the level of a whole vocabulary rather than one code.
 */
function parseExportedConstArrayNames(source: string): string[] {
  const stripped = stripComments(source);
  return [
    ...new Set(
      [...stripped.matchAll(/\bexport const ([A-Z][A-Z0-9_]*)\s*=\s*\[/g)].map(
        (match) => match[1] as string,
      ),
    ),
  ].sort();
}

/**
 * An INLINE string union on an interface field: `readonly distributionType: 'A' | 'B';`
 *
 * Needed because the engine declares `DistributionResult.distributionType` inline rather than as an
 * exported const — and a vocabulary that reaches a screen is a vocabulary that owes copy whether or
 * not somebody gave it a name. Hand-listing its two members here would be the hand-maintained list
 * this file replaces.
 */
function parseInlineFieldUnion(source: string, fieldName: string): string[] {
  const stripped = stripComments(source);
  const match = new RegExp(`\\breadonly ${fieldName}\\s*:([^;]*);`).exec(stripped);
  if (match === null) {
    throw new Error(
      `could not find "readonly ${fieldName}: … ;" — the field was renamed, or its type moved to a ` +
        `named alias. Repoint this parser at the new declaration rather than deleting the assertion.`,
    );
  }
  return [...(match[1] as string).matchAll(CODE_LITERAL)].map((literal) => literal[1] as string);
}

/**
 * `export type Name = 'A' | 'B';` out of a TypeScript source. Pass {@link WORD_LITERAL} as `literal`
 * for a union whose members are LOWERCASE words (`KpiTone`), which {@link CODE_LITERAL} cannot see —
 * the same split {@link parseWordConstArray} makes for `BOARD_STATES`.
 */
function parseStringUnion(
  source: string,
  typeName: string,
  literal: RegExp = CODE_LITERAL,
): string[] {
  const stripped = stripComments(source);
  const declaration = new RegExp(`\\bexport type ${typeName}\\s*=`);
  const match = declaration.exec(stripped);
  if (match === null) {
    throw new Error(
      `could not find "export type ${typeName} =" — the declaration was renamed or removed. Fix this ` +
        `parser rather than deleting the assertion.`,
    );
  }
  const end = stripped.indexOf(';', match.index);
  if (end === -1) throw new Error(`"export type ${typeName} =" has no terminating ";"`);
  return [...stripped.slice(match.index, end).matchAll(literal)].map((found) => found[1] as string);
}

/**
 * Every machine code a router puts into `DomainError.details.reasons` — the field the endowment
 * screens render one line per entry from.
 *
 * ── TWO ANCHORS, AND WHY BOTH ─────────────────────────────────────────────────────────────────
 *   · `reasons: [ … ]` — the object-literal form (`deed.ts:296`). A spread (`[...verdict.reasons]`)
 *     yields nothing, correctly: those codes are the domain's and are parsed from its own list.
 *   · `<helper>( … )` — the refusal helper that TAKES a reasons array (`deedRefused`). Its call sites
 *     are where the api's OWN codes are written, and `deed.ts:527` passes an IDENTIFIER rather than a
 *     literal, so identifiers are resolved through the file's `const NAME = 'VALUE'` declarations.
 *
 * An identifier inside an anchored region that cannot be resolved **throws**. That is the whole
 * design: the failure mode this file exists to close is a code going unnoticed, so an emission the
 * parser cannot read must stop the suite rather than be skipped.
 */
function parseEmittedReasonCodes(source: string, refusalHelpers: readonly string[]): string[] {
  const stripped = stripComments(source);

  /** `const REP_JOINT_LIABILITY_REQUIRED = 'REP_JOINT_LIABILITY_REQUIRED' as const;` */
  const constants = new Map<string, string>(
    [...stripped.matchAll(/\b(?:const|let)\s+([A-Z][A-Z0-9_]*)\s*=\s*'([A-Z][A-Z0-9_]*)'/g)].map(
      (match) => [match[1] as string, match[2] as string],
    ),
  );

  const regions: string[] = [];
  for (const match of stripped.matchAll(/\breasons:\s*\[/g)) {
    regions.push(sliceBalanced(stripped, match.index + match[0].length - 1, '[', ']'));
  }
  for (const helper of refusalHelpers) {
    const call = new RegExp(`\\b${helper}\\s*\\(`, 'g');
    const found = [...stripped.matchAll(call)];
    // A helper that no longer exists is a rename, and a rename that silently narrows the parse is
    // exactly how V-E3-M5 happened. Its declaration counts as one match, so a real call site is a
    // second — fewer than two means the helper was renamed or its call sites moved.
    if (found.length < 2) {
      throw new Error(
        `the refusal helper "${helper}" has fewer than two occurrences (declaration + at least one ` +
          `call site). It was renamed, removed, or its callers moved — repoint this parser at the new ` +
          `emission path rather than deleting the assertion, or codes emitted there become invisible ` +
          `to every parity mechanism again (V-E3-M5).`,
      );
    }
    for (const match of found) {
      regions.push(sliceBalanced(stripped, match.index + match[0].length - 1, '(', ')'));
    }
  }

  const codes = new Set<string>();
  for (const region of regions) {
    for (const literal of region.matchAll(/'([A-Z][A-Z0-9_]*)'/g)) {
      codes.add(literal[1] as string);
    }
    // Bare SCREAMING_SNAKE identifiers in an emission region are codes passed by reference.
    for (const identifier of region.matchAll(/(?<!['"`.\w])([A-Z][A-Z0-9_]{2,})(?!['"`\w])/g)) {
      const name = identifier[1] as string;
      const resolved = constants.get(name);
      if (resolved === undefined) {
        throw new Error(
          `an emission site passes the identifier "${name}", which this parser cannot resolve to a ` +
            `string literal. Extend the resolver — do NOT relax it: an unreadable emission is a code ` +
            `that ships with no ar/en wording and no test can see it (V-E3-M5).`,
        );
      }
      codes.add(resolved);
    }
  }
  return [...codes].sort();
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The catalogues
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type Catalogue = { [key: string]: string | Catalogue };

function flatten(catalogue: Catalogue, prefix = ''): Array<[string, string]> {
  return Object.entries(catalogue).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? flatten(value, path)
      : [[path, value as string] as [string, string]];
  });
}

const catalogues = {
  ar: JSON.parse(
    readFileSync(fileURLToPath(new URL('../messages/ar.json', import.meta.url)), 'utf8'),
  ) as Catalogue,
  en: JSON.parse(
    readFileSync(fileURLToPath(new URL('../messages/en.json', import.meta.url)), 'utf8'),
  ) as Catalogue,
} as const;

const keys = {
  ar: new Set(flatten(catalogues.ar).map(([key]) => key)),
  en: new Set(flatten(catalogues.en).map(([key]) => key)),
} as const;

/** The members currently catalogued under `<group>.` in a locale. */
function cataloguedMembers(locale: 'ar' | 'en', group: string): string[] {
  const prefix = `${group}.`;
  return [...keys[locale]]
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .filter((member) => !member.includes('.'));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · Every code-keyed group, and the source it comes from
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const schema = readFileSync(SOURCE_FILES.schema, 'utf8');
const deadlineRules = readFileSync(SOURCE_FILES.deadlineRules, 'utf8');
const boardState = readFileSync(SOURCE_FILES.boardState, 'utf8');
const complianceBoard = readFileSync(SOURCE_FILES.complianceBoard, 'utf8');
const eligibilityContract = readFileSync(SOURCE_FILES.eligibilityContract, 'utf8');
const deedRouter = readFileSync(SOURCE_FILES.deedRouter, 'utf8');
const beneficiaryRouter = readFileSync(SOURCE_FILES.beneficiaryRouter, 'utf8');
const reservedMatterRouter = readFileSync(SOURCE_FILES.reservedMatterRouter, 'utf8');
const distributionContract = readFileSync(SOURCE_FILES.distributionContract, 'utf8');
const distributionRefusal = readFileSync(SOURCE_FILES.distributionRefusal, 'utf8');

/** Every `*.ts` in the router directory, read once. */
const routerFiles = readdirSync(ROUTERS_DIR)
  .filter((name) => name.endsWith('.ts'))
  .sort()
  .map((name) => ({ name, source: readFileSync(`${ROUTERS_DIR}/${name}`, 'utf8') }));

/**
 * The reason codes the API layer emits itself — NOT the domain's.
 *
 * Scanned across EVERY router, so a second emitter is caught the day it is written. The refusal
 * HELPER anchor applies only to the file that declares one; the `reasons: [ … ]` anchor applies
 * everywhere, because that is the shape the field is written in.
 *
 * `ELIGIBILITY_NOT_ASSESSED` comes back from both this parse and the domain's list, which is correct
 * and not a duplication: the router re-emits the domain's code from its own NOT-NULL-column guard.
 */
const apiEmittedReasonCodes = [
  ...new Set(
    routerFiles.flatMap(({ name, source }) =>
      parseEmittedReasonCodes(source, name === 'deed.ts' ? ['deedRefused'] : []),
    ),
  ),
].sort();
const domainReasonCodes = parseConstArray(eligibilityContract, 'ELIGIBILITY_REASON_CODES');

/**
 * group (relative to the `endowments` namespace, as the screens key it) → its DECLARING source.
 *
 * Every group `messages.test.ts` lists by hand appears here derived from source instead. The two
 * files are deliberately redundant: that one hand-maintains and this one parses is the point.
 */
/**
 * ⊕ 2026-08-24 (Milestone 1) — the APPROVED subsets of the three TIER-1 statement vocabularies.
 *
 * Hand-listed ON PURPOSE, from `docs/product/statement-copy/APPROVED-WORDING.md` (the machine
 * transcription of Fadwa's ANSWERED brief): these are the codes whose ar/en statement wording is
 * product-approved and wired verbatim. A cross-check beside AUDITED_CODE_GROUPS asserts each
 * vocabulary is EXACTLY this subset plus its owed register — disjoint, nothing dropped — so the
 * hand-list cannot drift from either the engine contract or the register.
 */
const APPROVED_STATEMENT_SUBSETS = {
  'distribution.exclusionReason': [
    'UPPER_TABAQA_EXTANT',
    'TABAQA_EXTINCT',
    'ZERO_STIPULATED_WEIGHT',
    'BUTUN_LINE_NOT_CONTINUED',
    'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
  ],
  'distribution.entitlementRule': [
    'LINEAGE_PER_CAPITA_ZUHUR_ONLY',
    'LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN',
    'ORDERED_LOWEST_LIVING_TABAQA',
    'SHARED_ALL_LIVING_TABAQAT',
    'JOINT_FIXED_DEED_SHARES',
  ],
  'distribution.withheldReason': ['STALE_KYC', 'KYC_UNVERIFIED', 'CROSS_BORDER_PENDING'],
} as const;

const GROUP_SOURCES: Readonly<Record<string, { origin: string; members: readonly string[] }>> = {
  // ⊕ 2026-08-24 · the TIER-1 statement groups, checked member-for-member over the APPROVED subset.
  // The rest of each vocabulary is on the owed register; the cross-check near AUDITED_CODE_GROUPS
  // proves subset + register = the engine contract, with no overlap.
  'distribution.exclusionReason': {
    origin: 'docs/product/statement-copy/APPROVED-WORDING.md (ANSWERED brief, 2026-08-24)',
    members: APPROVED_STATEMENT_SUBSETS['distribution.exclusionReason'],
  },
  'distribution.entitlementRule': {
    origin: 'docs/product/statement-copy/APPROVED-WORDING.md (ANSWERED brief, 2026-08-24)',
    members: APPROVED_STATEMENT_SUBSETS['distribution.entitlementRule'],
  },
  'distribution.withheldReason': {
    origin: 'docs/product/statement-copy/APPROVED-WORDING.md (ANSWERED brief, 2026-08-24)',
    members: APPROVED_STATEMENT_SUBSETS['distribution.withheldReason'],
  },
  'endowments.classificationValue': {
    origin: 'schema.prisma · enum WaqfClassification',
    members: parsePrismaEnum(schema, 'WaqfClassification'),
  },
  'endowments.waqfTypeValue': {
    // ⚠ JOINT included, deliberately: the engine REFUSES the value but the vocabulary still carries
    // it (register item #11), and a refused value must render as words on the screen that says so.
    origin: 'schema.prisma · enum WaqfType',
    members: parsePrismaEnum(schema, 'WaqfType'),
  },
  'endowments.waqfNatureValue': {
    origin: 'schema.prisma · enum WaqfNature',
    members: parsePrismaEnum(schema, 'WaqfNature'),
  },
  'endowments.entitlementOrderValue': {
    origin: 'schema.prisma · enum EntitlementOrder',
    members: parsePrismaEnum(schema, 'EntitlementOrder'),
  },
  'endowments.continuationValue': {
    origin: 'schema.prisma · enum ContinuationStipulation',
    members: parsePrismaEnum(schema, 'ContinuationStipulation'),
  },
  'endowments.reversionKindValue': {
    origin: 'schema.prisma · enum ReversionKind',
    members: parsePrismaEnum(schema, 'ReversionKind'),
  },
  /**
   * ⊕ S11-1 — the owner's dropdown for the REGISTER_30BD clock-start ("make a drop down if that
   * helps", 9f3d8fd). STAFF-FACING labels on the internal operations app's endowment record, the
   * `reserved.kind` precedent: an operator choosing which date they are recording is not a statement
   * a beneficiary or regulator reads. ⚠ The Arabic is engineering's rendering, awaiting the owner's
   * confirmation alongside item 2's copy question — recorded as such, not as approved text.
   */
  'endowments.registrationAnchorKindValue': {
    origin: 'schema.prisma · enum RegistrationAnchorKind',
    members: parsePrismaEnum(schema, 'RegistrationAnchorKind'),
  },
  /**
   * ⊕ S11-2 — `DeadlineDischargeKind`, HOW a statutory deadline was discharged (owner ruling f797fea).
   * ONE member today; the vocabulary is the seam for a NOT-APPLICABLE state the open counsel question
   * may one day demand, and this entry is what makes a new member DEMAND its ar/en copy (the pin in
   * `packages/database` demands the migration and the record). ⚠ The Arabic is engineering's
   * rendering, awaiting the owner alongside item 2's copy question.
   */
  'endowments.dischargeKindValue': {
    origin: 'schema.prisma · enum DeadlineDischargeKind',
    members: parsePrismaEnum(schema, 'DeadlineDischargeKind'),
  },
  /**
   * ⚠ THE ARABIC HERE IS ENGINEERING'S RENDERING OF ORDINARY PROPERTY TERMS, awaiting the product
   * owner's confirmation — D-A's list was prefixed "I'm thinking". These are ordinary UI labels, not
   * statement copy: an asset's occupancy is not a legal statement a beneficiary disputes, so the
   * E10/E12 prohibition does not reach them.
   */
  'endowments.assetStatusValue': {
    origin: 'schema.prisma · enum AssetStatus',
    members: parsePrismaEnum(schema, 'AssetStatus'),
  },
  /**
   * S5/E4 — the beneficiary registry's vocabularies (BR-201…BR-206). Three come from the Prisma
   * enums; `kycValue` is the api layer's own COMPUTED type (`KycFreshness` in beneficiary.ts),
   * derived per read from the engine's gates predicates — a stored freshness column is exactly
   * what must never exist. ⚠ There is DELIBERATELY no group for `LineageLink` (SON/DAUGHTER): the
   * ẓuhūr/buṭūn eligibility fact is never rendered, and copy for it appearing in a catalogue is
   * itself the defect (ADR-0009).
   */
  'endowments.beneficiaries.kindValue': {
    origin: 'schema.prisma · enum BeneficiaryKind',
    members: parsePrismaEnum(schema, 'BeneficiaryKind'),
  },
  'endowments.beneficiaries.verificationValue': {
    origin: 'schema.prisma · enum VerificationStatus',
    members: parsePrismaEnum(schema, 'VerificationStatus'),
  },
  'endowments.beneficiaries.residencyValue': {
    origin: 'schema.prisma · enum BeneficiaryResidency',
    members: parsePrismaEnum(schema, 'BeneficiaryResidency'),
  },
  'endowments.beneficiaries.kycValue': {
    origin: 'packages/api/src/routers/beneficiary.ts · type KycFreshness',
    members: parseStringUnion(beneficiaryRouter, 'KycFreshness'),
  },
  'endowments.classification.gate': {
    origin: 'schema.prisma · enum ClassificationGate',
    members: parsePrismaEnum(schema, 'ClassificationGate'),
  },
  'endowments.classification.section': {
    origin: 'schema.prisma · enum ComplianceSection',
    members: parsePrismaEnum(schema, 'ComplianceSection'),
  },
  'endowments.reserved.status': {
    origin: 'schema.prisma · enum ApprovalStatus',
    members: parsePrismaEnum(schema, 'ApprovalStatus'),
  },
  /**
   * ⚠ `RECEIPT_CLASS_CORRECTION`'s ar/en IS ENGINEERING'S RENDERING (S6/E5, 2026-08-18), written in
   * the same register as its seven siblings and owed to the E10/E12 copy review — same standing as
   * the `AssetStatus` labels above.
   *
   * It is NOT on `COPY_OWED_TO_REVIEW` and that is deliberate: these are STAFF-FACING vocabulary on
   * an internal governance screen, naming the act an approval authorises. A reserved-matter kind is
   * not a legal statement a beneficiary disputes, so the E10/E12 prohibition on inventing statement
   * copy does not reach it — and parking a staff label on the owed register to go green would
   * hollow out a register that exists for sentences a beneficiary actually reads.
   *
   * ⚠ IF THIS KIND EVER SURFACES ON A BENEFICIARY STATEMENT, that copy is a different artifact and
   * goes through the owed register, not through this entry.
   *
   * ⊕ S10-2a — `CLASSIFICATION_RETURN_TO_NOT_CLASSIFIED` joins on EXACTLY this standing, and the
   * decision was taken by reading the paragraph above rather than by preference: it names the act a
   * maker≠checker approval authorises on an internal governance screen (owner ruling 2026-08-25,
   * S8 fourth batch — the reserved-matter gate on the migration-34 return door). Its ar/en is
   * engineering's rendering, owed to the same E10/E12 review, and it carries the same caveat — the
   * moment it would be rendered TO A BENEFICIARY it becomes a different artifact and goes to the
   * owed register instead.
   *
   * ⚠ ITS WORDING WAS CHOSEN AGAINST A SPECIFIC RISK, and the reasoning belongs with the label.
   * The reason this kind exists at all is that `executeReservedAct` COMPARES the kind, so a
   * mislabelled authority is worse than an unlabelled one — and that argument has a second half:
   * **the human checker reads this label when deciding whether to approve.** The first rendering
   * was "Return of a classification to not-classified" / «إعادة التصنيف إلى غير مُصنَّف», which is
   * accurate and scans as routine: the Arabic opens on إعادة التصنيف, the very phrase an ORDINARY
   * re-classification would carry, so the distinguishing content sat at the end of the string on a
   * queue a checker skims. What this actually authorises is the REVOCATION of a recorded
   * determination and the re-locking of a register whose duties were in force (migration 34's own
   * words). Both locales now lead with the revocation and name that consequence. A maker≠checker
   * control is only as strong as the layer it actually runs on, and that layer is a person reading
   * a label.
   */
  'endowments.reserved.kind': {
    origin: 'schema.prisma · enum ReservedMatterKind',
    members: parsePrismaEnum(schema, 'ReservedMatterKind'),
  },
  'endowments.reserved.chainState': {
    origin: 'packages/api/src/routers/reservedMatter.ts · type ChainStepState',
    members: parseStringUnion(reservedMatterRouter, 'ChainStepState'),
  },
  'endowments.eligibility.criteria': {
    origin: 'packages/domain/src/eligibility/contract.ts · ELIGIBILITY_CRITERIA',
    members: parseConstArray(eligibilityContract, 'ELIGIBILITY_CRITERIA'),
  },
  'endowments.eligibility.applicability': {
    origin: 'packages/domain/src/eligibility/contract.ts · CRITERION_APPLICABILITIES',
    members: parseConstArray(eligibilityContract, 'CRITERION_APPLICABILITIES'),
  },
  /**
   * The DOMAIN half only. The api half is asserted separately, below, so its failure carries its own
   * instructions instead of arriving as a generic "group is missing copy".
   */
  'endowments.eligibility.reasons': {
    origin: 'packages/domain/src/eligibility/contract.ts · ELIGIBILITY_REASON_CODES',
    members: domainReasonCodes,
  },

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * ⊕ S7 · the distribution run's TIER-2 vocabularies
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * Every entry here is INTERNAL OPERATIONS vocabulary rendered by the run wizard, the
   * maker/checker panel, the approvals queue or a dashboard tile, and its ar/en is ENGINEERING'S
   * RENDERING, owed to the E10/E12 copy review — the same standing as `assetStatusValue` and
   * `RECEIPT_CLASS_CORRECTION` above, and for the same stated reason: naming a run's lifecycle
   * state or a mapping's observation is not a legal statement a beneficiary disputes.
   *
   * ⚠ WHAT IS **NOT** HERE, AND WHY EACH ABSENCE IS DELIBERATE — see {@link VOCABULARY_DISPOSITION},
   * which enumerates EVERY vocabulary the engine declares and fails when a new one appears
   * unclassified. The three kinds of absence are: TIER-1 codes on the owed register, discriminators
   * rendered as machine codes beside one catalogued sentence, and the ẓuhūr/buṭūn descent fact,
   * which is never rendered at all.
   */
  'distribution.runStatus': {
    // ⚠ NOT `ApprovalStatus`. `endowments.reserved.status` is the approval's lifecycle; this is the
    // RUN's, and they differ in substance: there is no `REJECTED` run (a rejected run is
    // `CANCELLED`) and no `VOID`. Sharing one group would have made a rejected approval and a
    // cancelled run read as the same event.
    origin: 'schema.prisma · enum DistributionStatus',
    members: parsePrismaEnum(schema, 'DistributionStatus'),
  },
  'distribution.lineStatus': {
    origin: 'packages/domain/src/distribution/contract.ts · LINE_STATUSES',
    members: parseConstArray(distributionContract, 'LINE_STATUSES'),
  },
  'distribution.distributionTypeValue': {
    origin: 'packages/domain/src/distribution/contract.ts · DistributionResult.distributionType',
    members: parseInlineFieldUnion(distributionContract, 'distributionType'),
  },
  'distribution.receiptClass': {
    origin: 'packages/domain/src/distribution/contract.ts · RECEIPT_CLASSES',
    members: parseConstArray(distributionContract, 'RECEIPT_CLASSES'),
  },
  'distribution.capitalSource': {
    origin: 'packages/domain/src/distribution/contract.ts · CAPITAL_SOURCES',
    members: parseConstArray(distributionContract, 'CAPITAL_SOURCES'),
  },
  'distribution.feeBasis': {
    origin: 'packages/domain/src/distribution/contract.ts · FEE_BASES',
    members: parseConstArray(distributionContract, 'FEE_BASES'),
  },
  'distribution.timingStatus': {
    origin: 'packages/domain/src/distribution/contract.ts · TIMING_STATUSES',
    members: parseConstArray(distributionContract, 'TIMING_STATUSES'),
  },
  'distribution.deadlineBasis': {
    origin: 'packages/domain/src/distribution/contract.ts · DEADLINE_BASES',
    members: parseConstArray(distributionContract, 'DEADLINE_BASES'),
  },
  'distribution.bindingCalendar': {
    origin: 'packages/domain/src/distribution/contract.ts · BINDING_CALENDARS',
    members: parseConstArray(distributionContract, 'BINDING_CALENDARS'),
  },
  'distribution.authorityNoticeType': {
    origin: 'packages/domain/src/distribution/contract.ts · AUTHORITY_NOTICE_TYPES',
    members: parseConstArray(distributionContract, 'AUTHORITY_NOTICE_TYPES'),
  },
  'distribution.flag': {
    origin: 'packages/domain/src/distribution/contract.ts · RUN_FLAGS',
    members: parseConstArray(distributionContract, 'RUN_FLAGS'),
  },
  'distribution.invariant': {
    // ⚠ TWELVE, three of them hyphenated. See `CODE_LITERAL`: this group is the reason the literal
    // pattern was widened in S7, and it is the group that would have gone silently short.
    origin: 'packages/domain/src/distribution/contract.ts · INVARIANT_IDS',
    members: parseConstArray(distributionContract, 'INVARIANT_IDS'),
  },
  'distribution.traceStage': {
    // The STAGE names only. Every trace `message` is FROZEN COPY inside the hashed bytes a Nazir
    // signs and is never rendered; every trace `code` renders as a machine code.
    origin: 'packages/domain/src/distribution/contract.ts · TRACE_STAGES',
    members: parseConstArray(distributionContract, 'TRACE_STAGES'),
  },
  'distribution.diagnostic': {
    origin: 'packages/api/src/distribution/refusal.ts · MAPPING_DIAGNOSTICS',
    members: parseConstArray(distributionRefusal, 'MAPPING_DIAGNOSTICS'),
  },
  'distribution.diagnosticSeverity': {
    origin: 'packages/api/src/distribution/refusal.ts · type MappingDiagnosticSeverity',
    members: parseStringUnion(distributionRefusal, 'MappingDiagnosticSeverity'),
  },
  // ⊕ S11 · 2b (E10) — the compliance board. Members PARSED off their declaring sources, so a tenth
  // rule, an eighth state or a seventh cause demands its sentence in both locales before it can render.
  'dashboard.rule': {
    origin: 'packages/domain/src/deadlines/rules.ts · DEADLINE_RULE_KEYS',
    members: parseConstArray(deadlineRules, 'DEADLINE_RULE_KEYS'),
  },
  'dashboard.state': {
    origin: 'packages/domain/src/deadlines/board-state.ts · BOARD_STATES',
    members: parseWordConstArray(boardState, 'BOARD_STATES'),
  },
  'dashboard.cause': {
    origin: 'packages/domain/src/deadlines/board-state.ts · BOARD_CAUSES',
    members: parseConstArray(boardState, 'BOARD_CAUSES'),
  },
  /**
   * The tone word IS the figure in each chip's well, not a colour name the screen decorates with —
   * `refused` in particular is the fourth state that says "this seat could not look", and a chip
   * with no sentence for it would render an empty well. Parsed off `KpiTone` so a fifth tone cannot
   * reach the board without its word in both locales.
   */
  'dashboard.tone': {
    origin: 'packages/api/src/compliance-board.ts · type KpiTone',
    members: parseStringUnion(complianceBoard, 'KpiTone', WORD_LITERAL),
  },
  'dashboard.filings.platform': {
    origin: 'schema.prisma · enum GovernmentPlatform',
    members: parsePrismaEnum(schema, 'GovernmentPlatform'),
  },
  'dashboard.filings.status': {
    origin: 'schema.prisma · enum FilingStatus',
    members: parsePrismaEnum(schema, 'FilingStatus'),
  },
};

/** The orphan direction needs the UNION for this one group: extra api codes are legitimate. */
const CATALOGUE_MAY_ALSO_CARRY: Readonly<Record<string, readonly string[]>> = {
  'endowments.eligibility.reasons': apiEmittedReasonCodes,
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The parsers prove themselves before anything is asserted with them
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the parsers (self-test — an assertion over an empty set is worthless)', () => {
  it('reads a Prisma enum and ignores its doc comments', () => {
    const pretend = [
      '/// A doc comment naming a fake member: FAKE_MEMBER',
      'enum Pretend {',
      '  REAL_ONE',
      '  /// REAL_TWO is documented here',
      '  REAL_TWO',
      '}',
      'enum Decoy { NOPE }',
    ].join('\n');

    expect(parsePrismaEnum(pretend, 'Pretend')).toEqual(['REAL_ONE', 'REAL_TWO']);
  });

  it('throws rather than returning [] when an enum is gone', () => {
    expect(() => parsePrismaEnum('enum Other { X }', 'Pretend')).toThrow(/could not find/);
  });

  it('reads a const array and a string union', () => {
    expect(parseConstArray("export const P = ['A_ONE', 'B_TWO'] as const;", 'P')).toEqual([
      'A_ONE',
      'B_TWO',
    ]);
    expect(parseStringUnion("export type P = 'A_ONE' | 'B_TWO';", 'P')).toEqual(['A_ONE', 'B_TWO']);
  });

  it('reads emitted reason codes through BOTH anchors, including an identifier', () => {
    const pretend = [
      "const PASSED_BY_NAME = 'PASSED_BY_NAME' as const;",
      'function refuse(id: string, reasons: readonly string[]) { return { reasons }; }',
      "throw refuse('x', ['LITERAL_ONE']);",
      'throw refuse("x", [PASSED_BY_NAME]);',
      "const other = { reasons: ['IN_AN_OBJECT'] };",
      'const spread = { reasons: [...verdict.reasons] };',
      "// a comment naming NOT_A_CODE and 'ALSO_NOT'",
    ].join('\n');

    expect(parseEmittedReasonCodes(pretend, ['refuse'])).toEqual([
      'IN_AN_OBJECT',
      'LITERAL_ONE',
      'PASSED_BY_NAME',
    ]);
  });

  it('throws when a refusal helper is renamed away', () => {
    expect(() => parseEmittedReasonCodes('const x = 1;', ['refuse'])).toThrow(
      /fewer than two occurrences/,
    );
  });

  it('throws when an emission passes an identifier it cannot resolve', () => {
    const pretend = ['function refuse(r) {}', 'refuse([UNRESOLVABLE_CODE]);', 'refuse([]);'].join(
      '\n',
    );

    expect(() => parseEmittedReasonCodes(pretend, ['refuse'])).toThrow(/cannot resolve/);
  });

  it.each(Object.keys(GROUP_SOURCES))('parsed a non-empty vocabulary for %s', (group) => {
    const { members, origin } = GROUP_SOURCES[group] as { origin: string; members: string[] };
    expect(members.length, `parsed nothing from ${origin} — the parser is broken`).toBeGreaterThan(
      0,
    );
    expect(new Set(members).size, `duplicate member from ${origin}`).toBe(members.length);
  });

  it('scanned the whole router directory, not one hand-named file', () => {
    // The directory read is what makes a FUTURE router visible. If it ever returns one or two files,
    // the scan has been narrowed and a new emitter would go unseen — which is V-E3-M5 again.
    expect(routerFiles.map(({ name }) => name)).toContain('deed.ts');
    expect(
      routerFiles.length,
      'the router directory read returned almost nothing',
    ).toBeGreaterThanOrEqual(5);
  });

  it('parsed at least four reason codes out of the deed router', () => {
    // A floor, not the count: a hardcoded count is a hand-copied fact, which is the very thing this
    // file replaces. Four is what the two anchors reach today; fewer means the parse went blind.
    expect(apiEmittedReasonCodes.length).toBeGreaterThanOrEqual(4);
  });

  it('sees the two codes V-E3-M5 named — the mechanism is not vacuous', () => {
    // This assertion is the measurement, kept: these codes were emitted and invisible to all three
    // earlier mechanisms. If this ever goes red because the api stopped emitting them, that is a
    // legitimate close of V-E3-M5 and this line should be updated with the commit that did it.
    expect(apiEmittedReasonCodes).toContain('REP_ELIGIBILITY_WITHOUT_REPRESENTATIVE');
    expect(apiEmittedReasonCodes).toContain('REP_ELIGIBILITY_NOT_ASSESSED');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · Source → catalogue, in both directions, for every code-keyed group
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('every group looked up by machine code is derived from its declaring source', () => {
  it.each(Object.keys(GROUP_SOURCES))('%s has ar and en copy for every source member', (group) => {
    const { members, origin } = GROUP_SOURCES[group] as { origin: string; members: string[] };
    const missing = locales.flatMap((locale) =>
      members
        .filter((member) => !keys[locale].has(`${group}.${member}`))
        .map((member) => `${locale}: ${group}.${member}`),
    );

    expect(
      missing,
      `${origin} declares ${members.length} member(s); the catalogue is missing the copy listed. ` +
        `next-intl PRINTS a missing key rather than throwing, so this would render as a raw dotted ` +
        `key on an Arabic-first screen with every suite green.`,
    ).toEqual([]);
  });

  it.each(Object.keys(GROUP_SOURCES))(
    '%s carries no member its source does not declare',
    (group) => {
      const { members, origin } = GROUP_SOURCES[group] as { origin: string; members: string[] };
      const permitted = new Set([...members, ...(CATALOGUE_MAY_ALSO_CARRY[group] ?? [])]);
      const orphans = locales.flatMap((locale) =>
        cataloguedMembers(locale, group)
          .filter((member) => !permitted.has(member))
          .map((member) => `${locale}: ${group}.${member}`),
      );

      // An orphan means the vocabulary was RENAMED and the old label stayed: dead copy a translator
      // keeps maintaining, and a hint that the new member's message may never have been written.
      expect(orphans, `not declared by ${origin}`).toEqual([]);
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · The api's OWN reason codes, and the OWED-COPY REGISTER — V-E3-M5, carried as a debt
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** One owed entry. Every field is load-bearing: an entry with no reason is an exemption. */
type OwedCopyEntry = {
  /** WHY the wording cannot be authored in a code change. Not "TODO" — the actual objection. */
  readonly reason: string;
  /** The epic that owns authoring AND approving it. The review path, named. */
  readonly owner: string;
  /** Where the code is emitted, so the entry can be audited against the source by hand. */
  readonly emittedAt: string;
  /** What closes the entry. Never "make the test pass". */
  readonly closedBy: string;
};

/**
 * ── THE REGISTER ──────────────────────────────────────────────────────────────────────────────
 * Reason codes that reach a screen with NO ar/en wording, whose wording is owed to a review path
 * that a code change may not shortcut.
 *
 * ⚠ THIS IS NOT AN ALLOW-LIST AND MUST NOT BECOME ONE. Adding a code here is a claim that its
 * sentence is product-approved legal text somebody else must author — not that the test is
 * inconvenient. Three enforcement directions below make a wrong entry fail: an entry that gains copy
 * fails, an entry nothing emits fails, and an entry missing any of its four fields fails.
 *
 * ⚠ AND THE OBVIOUS ABUSE, NAMED: a new omission can be silenced by typing its code into this
 * object. Nothing in a test file can prevent that — what a test file CAN do is make the silencing a
 * visible, reviewable line in a diff with a written justification beside it, instead of a hand-list
 * that never mentioned the code at all (which is exactly what V-E3-M5 was). The register is honest
 * about being a record, not a lock.
 */
/**
 * ⊖ EMPTIED 2026-08-24 (Milestone 1): both REP_ELIGIBILITY_* sentences arrived in Fadwa's ANSWERED
 * wording brief (`docs/product/statement-copy/APPROVED-WORDING.md`) and are wired verbatim under
 * `endowments.eligibility.reasons` — V-E3-M5's original pair, the register's founding debt, is PAID.
 * Per the register's own retirement instruction ("do NOT leave an empty exemption list behind"),
 * the two entries are deleted and the group's copy is now demanded UNCONDITIONALLY by the
 * generalised four-direction audit below (its `owed` set for this group is empty). The dedicated
 * §6 describe block that narrated this specific register retired with it — the generalised block
 * (§6b) drives the identical four directions over the same real parse.
 */
const COPY_OWED_TO_REVIEW: Readonly<Record<string, OwedCopyEntry>> = {};

/**
 * ── THE DISTRIBUTION EXCLUSION CODES · TIER 1, all eight ─────────────────────────────────────
 *
 * `DistributionLine.reasonCode` on an `EXCLUDED` line. Every one of these is *the sentence a
 * beneficiary reads on their BR-505 statement explaining why the deed paid them nothing this
 * period* — which is the discriminator this file already uses for TIER 1: product-approved legal
 * text a beneficiary may dispute before the Authority. Arabic is authoritative (NFR-01), so the
 * Arabic IS the legal statement, not a translation of an English one.
 *
 * ⚠ THREE OF THEM ARE TEMPORARY EXCLUSIONS AND THE COPY MUST NOT READ AS PERMANENT. That is not a
 * stylistic note — it is the whole reason a code change may not author them.
 */
const EXCLUSION_COPY_OWED_TO_REVIEW: Readonly<Record<string, OwedCopyEntry>> = {
  BENEFICIARY_INACTIVE: {
    reason:
      "the statement is about this member's OWN status and never an ancestor's, and the two must not " +
      'be confusable: a sentence that could be read as "somebody ahead of you holds it" would send a ' +
      'reader to the wrong remedy entirely. The distinction is legal, so the wording is too.',
    owner: 'E10/E12 — product-approved copy, with a review path',
    emittedAt: 'packages/domain/src/distribution/contract.ts · EXCLUSION_REASON_CODES',
    closedBy:
      'the approved ar+en wording landing in messages/{ar,en}.json under ' +
      'distribution.exclusionReason — or the engine ceasing to emit the code',
  },
  REVERSION_PENDING_LIVING_BLOODLINE: {
    reason:
      "printed on a CHARITY's own statement, and the engine's contract states the constraint in as " +
      "many words: copy that implies an expectation of the family's death is worse than no copy at " +
      'all. It must also not promise the charity that it waits for EXTINCTION — since R7-d it waits ' +
      'for the last line the deed continues, which is a narrower and different fact.',
    owner: 'E10/E12 — product-approved copy, with a review path',
    emittedAt: 'packages/domain/src/distribution/contract.ts · EXCLUSION_REASON_CODES',
    closedBy:
      'the approved ar+en wording landing in messages/{ar,en}.json under ' +
      'distribution.exclusionReason — or the engine ceasing to emit the code',
  },
  REVERSION_PENDING_BLOODLINE_UNENUMERATED: {
    reason:
      "it must read as an INCOMPLETE REGISTER and NOT as a refusal of the charity's appointment, and " +
      'it must not tell a jiha that the bloodline is living on a register where nobody is recorded as ' +
      "living — the engine's contract records that exact mis-labelling as a defect. It reverses on an " +
      'ENROLMENT rather than on a death, which no borrowed sentence expresses.',
    owner: 'E10/E12 — product-approved copy, with a review path',
    emittedAt: 'packages/domain/src/distribution/contract.ts · EXCLUSION_REASON_CODES',
    closedBy:
      'the approved ar+en wording landing in messages/{ar,en}.json under ' +
      'distribution.exclusionReason — or the engine ceasing to emit the code',
  },
};

/**
 * ── THE ENTITLEMENT RULES · TIER 1, all seven ────────────────────────────────────────────────
 *
 * `DistributionLine.basis.rule`, printed on the beneficiary's official Arabic BR-505 statement. The
 * engine's own contract says why these cannot be collapsed or borrowed: *"'your line continues' and
 * 'your line does not continue under this deed' are different legal statements to make to a family
 * member."*
 *
 * ⚠ `NA_DIRECT_USE` IS HERE EVEN THOUGH `endowments.entitlementOrderValue.NA_DIRECT_USE` EXISTS.
 * Same spelling, different vocabulary: that key labels the DEED's entitlement order on a record
 * screen; this code is the BASIS printed on a statement. Reusing the order's label as the rule's is
 * the trap this register exists to make visible — and because `hasCopy` is scoped to the group, the
 * existing key correctly does NOT satisfy this entry.
 */
const ENTITLEMENT_RULE_COPY_OWED_TO_REVIEW: Readonly<Record<string, OwedCopyEntry>> = {
  ULTIMATE_TAKER_MAAL_AL_WAQF: {
    reason:
      'مآل الوقف — printed in the period a family endowment ends, and read by the heirs of the ' +
      'descendants it names as gone; they may dispute it before the Authority. It must state that the ' +
      "clause decided this line INSTEAD OF the deed's standing entitlement order, and must not render " +
      "the order's lineage rule as a charity's basis (which would tell a charity it descends from the " +
      'waqif — the exact mis-statement ADR-0009 records as a defect).',
    owner: 'E10/E12 — product-approved copy, with a review path',
    emittedAt: 'packages/domain/src/distribution/contract.ts · ENTITLEMENT_RULES',
    closedBy:
      'the approved ar+en wording landing in messages/{ar,en}.json under ' +
      'distribution.entitlementRule — or the engine ceasing to emit the rule',
  },
  NA_DIRECT_USE: {
    reason:
      'intifāʿ mubāshir / انتفاع مباشر as a STATEMENT BASIS, and it must not borrow ' +
      "endowments.entitlementOrderValue.NA_DIRECT_USE: that key names the deed's order on a record " +
      'screen, while this one has to tell a beneficiary why no monetary entitlement was computed for ' +
      'them at all. Same spelling, different vocabulary, different reader, different sentence.',
    owner: 'E10/E12 — product-approved copy, with a review path',
    emittedAt: 'packages/domain/src/distribution/contract.ts · ENTITLEMENT_RULES',
    closedBy:
      'the approved ar+en wording landing in messages/{ar,en}.json under ' +
      'distribution.entitlementRule — or the engine ceasing to emit the rule',
  },
};

/**
 * ── THE WITHHELD (GATE) REASONS · TIER 1, the two still undrafted ────────────────────────────
 *
 * `GATE_REASON_CODES` — an ENTITLED beneficiary whose payment is gated; the share is retained
 * intact (the brief's ground rule 4: withheld is different IN KIND from excluded). Their
 * `errors.domain.*` twins remain the ERROR/toast voice; the STATEMENT voice is
 * `distribution.withheldReason`, commissioned by the wording brief precisely because a validation
 * toast is the wrong register for telling a living, entitled person their money is held.
 * Three of the five arrived in the ANSWERED brief and are wired; these two were left blank.
 */
const WITHHELD_COPY_OWED_TO_REVIEW: Readonly<Record<string, OwedCopyEntry>> = {
  CATEGORY_NOT_CAPTURED: {
    reason:
      'the statement tells a member of a deed-named CLASS ("the poor of the district") that their ' +
      'class is entitled and individual enrolment is pending — it must not read as doubt about the ' +
      'class or the person. Left blank in the ANSWERED brief (2026-08-24); still owed.',
    owner: 'E10/E12 — product-approved copy, with a review path (brief item 9)',
    emittedAt: 'packages/domain/src/distribution/contract.ts · GATE_REASON_CODES',
    closedBy:
      'the approved ar+en wording landing in messages/{ar,en}.json under ' +
      'distribution.withheldReason — or the engine ceasing to emit the code',
  },
  ENTITY_UNLICENSED: {
    reason:
      'the statement tells a legal entity its share is HELD, not forfeited, until its licence is ' +
      'current — licences lapse routinely and the sentence must not read as an accusation. Left ' +
      'blank in the ANSWERED brief (2026-08-24); still owed.',
    owner: 'E10/E12 — product-approved copy, with a review path (brief item 10)',
    emittedAt: 'packages/domain/src/distribution/contract.ts · GATE_REASON_CODES',
    closedBy:
      'the approved ar+en wording landing in messages/{ar,en}.json under ' +
      'distribution.withheldReason — or the engine ceasing to emit the code',
  },
};

const OWED_CODES = Object.keys(COPY_OWED_TO_REVIEW).sort();

/** The three ways the register and the catalogue can disagree. */
type CopyAudit = {
  /** Missing copy and NOT registered — a NEW omission. This is the direction that must break CI. */
  readonly unregistered: string[];
  /** Registered, but the catalogue already carries wording — the register has ROTTED. */
  readonly rotted: string[];
  /** Registered, but nothing emits it any more — a dead entry, which is also rot. */
  readonly dead: string[];
};

/**
 * Pure so the mechanism can be mutated in-suite (§9) rather than only by hand.
 *
 * A registered code must be missing in BOTH locales. Half-written copy is reported as ROT, not
 * tolerated: one locale's sentence with the other blank is the worst of the three states — the screen
 * looks answered in English and stays a bare Latin code in Arabic, which is the authoritative one.
 */
function auditReasonCopy(
  emitted: readonly string[],
  registered: readonly string[],
  hasCopy: (locale: Locale, code: string) => boolean,
): CopyAudit {
  const registry = new Set(registered);
  const emissions = new Set(emitted);

  const unregistered = emitted.flatMap((code) =>
    registry.has(code)
      ? []
      : locales.filter((locale) => !hasCopy(locale, code)).map((locale) => `${locale}: ${code}`),
  );
  const rotted = registered.flatMap((code) =>
    locales.filter((locale) => hasCopy(locale, code)).map((locale) => `${locale}: ${code}`),
  );
  const dead = registered.filter((code) => !emissions.has(code));

  return { unregistered, rotted, dead };
}

/**
 * `hasCopy`, SCOPED TO A CATALOGUE GROUP — the generalisation S7 owed this mechanism.
 *
 * ⚠ THE SCOPING IS NOT COSMETIC. Until S7 this was hardcoded to `endowments.eligibility.reasons`,
 * so the register could only ever audit one group. Three of the codes S7 registers share a spelling
 * with a key that already exists in a DIFFERENT group — `NA_DIRECT_USE`
 * (`endowments.entitlementOrderValue`), `CROSS_BORDER_PENDING` (`errors.domain`, as a gate code) —
 * and a bare "does this code appear anywhere?" test would have reported them as ALREADY WORDED and
 * silently satisfied a TIER-1 entry with a label written for a different reader.
 */
const hasCopyIn =
  (group: string) =>
  (locale: Locale, code: string): boolean =>
    keys[locale].has(`${group}.${code}`);

const hasReasonCopy = hasCopyIn('endowments.eligibility.reasons');

/**
 * One audited vocabulary: where its codes come from, where their copy WOULD live, and which of them
 * are owed to a review path.
 *
 * Adding a group here is what makes the four enforcement directions apply to it. A vocabulary that
 * is NOT here is invisible to the register — which is the state the whole distribution vocabulary
 * was in before S7, and {@link VOCABULARY_DISPOSITION} is what now makes that state impossible to
 * reach by accident.
 */
type AuditedCodeGroup = {
  /** The catalogue prefix its copy lives under. Also the audit's scope — see {@link hasCopyIn}. */
  readonly group: string;
  /** The declaring source, for a failure message somebody can act on. */
  readonly origin: string;
  /** Every code the group must account for, PARSED — never hand-listed. */
  readonly emitted: readonly string[];
  /** The owed register for this group. */
  readonly owed: Readonly<Record<string, OwedCopyEntry>>;
  /** A floor, so a parse that went blind cannot make the audit vacuous. */
  readonly floor: number;
};

const AUDITED_CODE_GROUPS: readonly AuditedCodeGroup[] = [
  {
    // ⊖ `owed` EMPTIED 2026-08-24 — copy for this group is now demanded UNCONDITIONALLY.
    group: 'endowments.eligibility.reasons',
    origin: 'packages/api/src/routers/** · DomainError.details.reasons',
    emitted: apiEmittedReasonCodes,
    owed: COPY_OWED_TO_REVIEW,
    floor: 4,
  },
  {
    // ⊕ S7 · TIER 1. ⊖ 2026-08-24: FIVE of the eight gained approved wording (APPROVED-WORDING.md)
    // and left the register; THREE stay owed (one of them, BENEFICIARY_INACTIVE, the answered brief
    // itself marks ON HOLD pending a product-owner decision).
    group: 'distribution.exclusionReason',
    origin: 'packages/domain/src/distribution/contract.ts · EXCLUSION_REASON_CODES',
    emitted: parseConstArray(distributionContract, 'EXCLUSION_REASON_CODES'),
    owed: EXCLUSION_COPY_OWED_TO_REVIEW,
    floor: 8,
  },
  {
    // ⊕ S7 · TIER 1. ⊖ 2026-08-24: FIVE of the seven gained approved wording; TWO stay owed
    // (ULTIMATE_TAKER_MAAL_AL_WAQF and NA_DIRECT_USE were left blank in the answered brief).
    group: 'distribution.entitlementRule',
    origin: 'packages/domain/src/distribution/contract.ts · ENTITLEMENT_RULES',
    emitted: parseConstArray(distributionContract, 'ENTITLEMENT_RULES'),
    owed: ENTITLEMENT_RULE_COPY_OWED_TO_REVIEW,
    floor: 7,
  },
  {
    // ⊕ 2026-08-24 (Milestone 1) · TIER 1. The withheld/gate vocabulary joins the audit the day
    // its STATEMENT group exists: three of five wired from the ANSWERED brief, two owed.
    group: 'distribution.withheldReason',
    origin: 'packages/domain/src/distribution/contract.ts · GATE_REASON_CODES',
    emitted: parseConstArray(distributionContract, 'GATE_REASON_CODES'),
    owed: WITHHELD_COPY_OWED_TO_REVIEW,
    floor: 5,
  },
];

/** Every code owed across every audited group, for the read-aloud and the pin. */
const ALL_OWED = AUDITED_CODE_GROUPS.flatMap((audited) =>
  Object.keys(audited.owed).map((code) => ({ code, audited })),
);

describe('the APPROVED subsets and the owed registers PARTITION each TIER-1 vocabulary', () => {
  // The hand-list in APPROVED_STATEMENT_SUBSETS cannot drift: for each statement group, the wired
  // subset plus its owed register must be EXACTLY the engine vocabulary, with no code in both and
  // none in neither. A code leaving the register must join the subset in the same edit (and vice
  // versa), or this goes red naming it.
  const VOCAB_OF: Readonly<Record<string, string>> = {
    'distribution.exclusionReason': 'EXCLUSION_REASON_CODES',
    'distribution.entitlementRule': 'ENTITLEMENT_RULES',
    'distribution.withheldReason': 'GATE_REASON_CODES',
  };
  it.each(Object.keys(VOCAB_OF))('%s — subset ⊎ owed = the engine contract', (group) => {
    const audited = AUDITED_CODE_GROUPS.find((entry) => entry.group === group);
    expect(audited, `${group} must be an audited group`).toBeDefined();
    const wired = APPROVED_STATEMENT_SUBSETS[group as keyof typeof APPROVED_STATEMENT_SUBSETS];
    const owed = Object.keys(audited?.owed ?? {});
    const vocabulary = parseConstArray(distributionContract, VOCAB_OF[group] as string);
    expect([...wired, ...owed].sort()).toEqual([...vocabulary].sort());
    expect(wired.filter((code) => owed.includes(code))).toEqual([]);
  });
});

/* ⊖ THE §6-SPECIFIC DESCRIBE BLOCK RETIRED 2026-08-24 with its register (see the emptied
 * COPY_OWED_TO_REVIEW above): its four directions run for this group — and every other audited
 * group — in §6b below, over the same real parse. Its bespoke failure messages moved with the
 * debt: the debt is paid. */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6b · THE SAME FOUR DIRECTIONS, FOR EVERY AUDITED GROUP — the S7 generalisation
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The block above is the eligibility-reasons instance, kept verbatim because its failure messages
 * are written for that specific decision ("ordinary E3 validation message" vs "legal text"). This
 * block runs the identical four directions over EVERY entry in {@link AUDITED_CODE_GROUPS}, scoped
 * per group, so a new TIER-1 vocabulary is enforced the day it is added rather than the day somebody
 * remembers to copy this block.
 *
 * ⚠ IT INCLUDES THE ELIGIBILITY GROUP AS WELL. The overlap is deliberate: if a refactor ever points
 * the block above at fabricated inputs, this one still drives the real parse, and vice versa.
 */
describe.each(AUDITED_CODE_GROUPS.map((audited) => [audited.group, audited] as const))(
  '%s — every code has copy, or is on the owed register',
  (_group, audited) => {
    const owedCodes = Object.keys(audited.owed).sort();
    const audit = auditReasonCopy(audited.emitted, owedCodes, hasCopyIn(audited.group));

    it('parsed a non-empty vocabulary — the audit is not vacuous', () => {
      expect(
        audited.emitted.length,
        `parsed ${audited.emitted.length} code(s) from ${audited.origin}, expected at least ` +
          `${audited.floor}. A parse that returns a SUBSET reports its own blindness as a pass — see ` +
          `CODE_LITERAL, where exactly that happened to INVARIANT_IDS (9 of 12).`,
      ).toBeGreaterThanOrEqual(audited.floor);
      expect(new Set(audited.emitted).size, `duplicate member from ${audited.origin}`).toBe(
        audited.emitted.length,
      );
    });

    it('DIRECTION 1 — a code with no copy and no register entry fails', () => {
      expect(
        audit.unregistered,
        [
          '',
          `⚠ ${audited.origin} declares the code(s) above; ${audited.group}.<CODE> has no wording in`,
          "the locale(s) named, and they are not on this group's owed register.",
          '',
          'next-intl PRINTS a missing key rather than throwing, so this ships as a raw dotted key on an',
          'Arabic-first screen with every suite green (V-E3-M5).',
          '',
          'TWO legitimate fixes, NOT interchangeable:',
          '  (a) ORDINARY STAFF-FACING VOCABULARY on an internal operations screen (a run status, a',
          '      trace stage, a mapping observation) → write the ar+en copy under a distribution.* group',
          '      and add the group to GROUP_SOURCES. That is not owed to anyone. ⚠ Do NOT park a staff',
          '      label on the register: it would hollow out a register that exists for sentences a',
          '      beneficiary actually reads.',
          '  (b) PRODUCT-APPROVED LEGAL TEXT a beneficiary may dispute before the Authority — anything',
          '      printed on a BR-505 statement as the reason they were paid nothing, or as the basis on',
          "      which their share was decided → add it to this group's register with its reason, owner,",
          '      emission site and closing condition. CLAUDE.md binding rule 4 forbids a code change',
          '      inventing it.',
          '',
          'What is NOT a fix: deleting this assertion, or narrowing the parser so the code stops being',
          'seen.',
          '',
        ].join('\n'),
      ).toEqual([]);
    });

    it('DIRECTION 2 — a registered code that already HAS copy fails (the register must not rot)', () => {
      expect(
        audit.rotted,
        `${audited.group} now carries wording for a code still on its owed register. If the review ` +
          `path authored and approved it, the debt is PAID: delete that entry so the code is guarded ` +
          `unconditionally. If only ONE locale is listed, the copy is half-written — finish the Arabic ` +
          `(it is the authoritative one, NFR-01) and then delete the entry.`,
      ).toEqual([]);
    });

    it('DIRECTION 3 — a registered code nothing declares any more fails (a dead entry is rot too)', () => {
      expect(
        audit.dead,
        `this group's owed register lists a code that ${audited.origin} no longer declares. Either the ` +
          `vocabulary genuinely dropped it — a legitimate close, so delete the entry and record it — or ` +
          `the parser stopped SEEING it, which is far worse: the code would then be emitted with no ` +
          `copy and nothing would notice.`,
      ).toEqual([]);
    });

    it.each(owedCodes.length > 0 ? owedCodes : ['(none owed in this group)'])(
      '%s carries a written reason, a named owning epic and a closing condition',
      (code) => {
        const entry = audited.owed[code];
        if (entry === undefined) {
          // A group with nothing owed is the healthy end state, not a failure.
          expect(owedCodes).toEqual([]);
          return;
        }
        expect(entry.reason.length, `${code}: no reason written`).toBeGreaterThan(40);
        expect(entry.closedBy.length, `${code}: nothing says what closes it`).toBeGreaterThan(20);
        expect(entry.emittedAt, `${code}: no emission site recorded`).toMatch(/packages\/.+\.ts/);
        expect(
          entry.owner,
          `${code}: the owning epic must be named — a debt with no owner is a wish`,
        ).toMatch(/E\d+/);
      },
    );

    it('every registered code is one the source actually declares', () => {
      // The mirror of DIRECTION 3, stated positively so a TYPO in a register key is named as a typo
      // rather than arriving as "dead entry" — the two have very different remedies.
      const declared = new Set(audited.emitted);
      expect(
        owedCodes.filter((code) => !declared.has(code)),
        `registered code(s) that ${audited.origin} does not declare — check for a misspelling before ` +
          `concluding the vocabulary changed`,
      ).toEqual([]);
    });
  },
);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7 · The census — a NEW emission path cannot hide the way V-E3-M5 did
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Every SCREAMING_SNAKE literal in the eligibility-refusal router, classified.
 *
 * ── WHY A CENSUS AND NOT JUST THE ANCHORED PARSE ──────────────────────────────────────────────
 * The anchored parse reads the emission paths that exist TODAY. V-E3-M5's actual lesson is subtler:
 * the codes were invisible because nothing forced anyone to classify them at all. So the census
 * inverts the default — a literal this file has never seen fails the suite until someone says what
 * it is. Adding a code through a third, unanticipated path is then a red test, not a silent ship.
 *
 * `REASON_CODE` members are not listed here: they come from the parse, and listing them would
 * re-introduce the hand-maintained list this file replaces.
 */
const NOT_A_REASON_CODE: Readonly<Record<string, string>> = {
  // A criterion NAME, passed to `requireAssessed` and rendered from `endowments.eligibility.criteria`.
  ISLAM: 'criterion',
  LEGAL_CAPACITY: 'criterion',
  NO_DISQUALIFYING_REMOVAL: 'criterion',
  KSA_RESIDENCY: 'criterion',
  // A `CriterionApplicability`, rendered from `endowments.eligibility.applicability`.
  REQUIRED: 'applicability',
  // A `DomainError` code, rendered from `errors.domain.*` (pinned by messages.test.ts).
  NAZIR_INELIGIBLE: 'domainErrorCode',
  // Audit-trail vocabulary. Never rendered to a user, so no catalogue entry is owed.
  CREATE: 'auditVocabulary',
  UPDATE: 'auditVocabulary',
  MUTATION: 'auditVocabulary',
  SENSITIVE: 'auditVocabulary',

  // ── Added 2026-08-17, by this census doing exactly what it was built to do ──────────────────
  // These four literals entered `routers/deed.ts` with the owner's Q10 ruling (the trusteeship deed
  // is write-once; a court-ordered change is a NEW superseding record) and the BR-109 verification
  // path that ruling's seal had foreclosed. THE CENSUS CAUGHT THEM ON THE FIRST RUN AFTER THEY WERE
  // WRITTEN — which is the whole point of V-E3-M5: the mechanism that replaced the hand-maintained
  // list fails the build when a new code appears, instead of letting it ship without copy.
  //
  // ⚠ NO ARABIC WAS INVENTED FOR ANY OF THEM, and none is owed:
  //  · `DEED_TERM_WRITE_ONCE` is a `DomainError` code and ALREADY carries `errors.domain.*` in both
  //    catalogues (verified: 1 hit in ar.json, 1 in en.json) — it needed the classification, not copy.
  //  · the other three are MACHINE facts on the wire, never rendered: two values of the `recorded`
  //    discriminator telling a caller which act was recorded, and one `remedy` naming the route back
  //    (a superseding record). If a screen ever renders one, it must render it through product-approved
  //    copy owed to E10/E12 — at which point this classification is what makes that a deliberate
  //    decision rather than a silent one.
  DEED_TERM_WRITE_ONCE: 'domainErrorCode',
  APPOINTMENT_AND_ASSESSMENT: 'wireDiscriminator',
  ELIGIBILITY_VERIFICATION: 'wireDiscriminator',
  SUPERSEDING_RECORD: 'machineRemedy',
};

/** What each classification obliges the catalogue to carry, if anything. */
const CLASSIFICATION_REQUIRES: Readonly<Record<string, string | null>> = {
  criterion: 'endowments.eligibility.criteria',
  applicability: 'endowments.eligibility.applicability',
  domainErrorCode: 'errors.domain',
  auditVocabulary: null,
  // A discriminator on the wire (which act was recorded) — machine-read, never rendered, so no
  // catalogue entry is owed. ⚠ If one is ever put on a screen, it needs product-approved copy from
  // E10/E12 and this classification is what forces that to be a decision.
  wireDiscriminator: null,
  // A machine-readable remedy naming the route back (e.g. a superseding record). Same rule.
  machineRemedy: null,
};

describe('the literal census over the eligibility-refusal router', () => {
  const literals = [
    ...new Set(
      [...stripComments(deedRouter).matchAll(/'([A-Z][A-Z0-9_]{2,})'/g)].map(
        (match) => match[1] as string,
      ),
    ),
  ].sort();

  it('found a plausible number of literals to classify', () => {
    expect(literals.length).toBeGreaterThanOrEqual(10);
  });

  it('classifies every machine-code literal — an unclassified one is a possible new emission path', () => {
    const emitted = new Set(apiEmittedReasonCodes);
    const unclassified = literals.filter(
      (literal) => !emitted.has(literal) && !(literal in NOT_A_REASON_CODE),
    );

    expect(
      unclassified,
      `packages/api/src/routers/deed.ts contains machine-code literal(s) this file has never seen. ` +
        `If one is a REFUSAL REASON, it needs ar+en copy (owed to E10/E12 — see the block above) and ` +
        `the parser's anchors must reach it. If it is not, add it to NOT_A_REASON_CODE with the one ` +
        `word that says what it is. Do NOT widen the census away: V-E3-M5 was exactly a code nobody ` +
        `was ever asked to classify.`,
    ).toEqual([]);
  });

  it.each(Object.keys(NOT_A_REASON_CODE))(
    '%s is classified, and its classification carries its own catalogue obligation',
    (literal) => {
      const classification = NOT_A_REASON_CODE[literal] as string;
      const group = CLASSIFICATION_REQUIRES[classification];
      expect(
        Object.keys(CLASSIFICATION_REQUIRES),
        `"${classification}" is not a known classification`,
      ).toContain(classification);
      if (group === null || group === undefined) return;
      for (const locale of locales) {
        expect(keys[locale].has(`${group}.${literal}`), `${locale}: ${group}.${literal}`).toBe(
          true,
        );
      }
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7b · ⊕ S7 · EVERY VOCABULARY THE DISTRIBUTION ENGINE DECLARES IS CLASSIFIED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The census in §7 inverts the default for one LITERAL in one router. This block inverts it for a
 * whole VOCABULARY, which is the level the distribution failure actually happened at:
 *
 * MEASURED, on this branch, before this block existed: `packages/api/src/routers/distribution.ts`
 * landed carrying `flags` (13 codes), `invariantsChecked` (12), per-line `status` (4) and
 * `reasonCode` (13 possible), `timing.{status,basis,bindingCalendar}`, eleven mapping diagnostics and
 * seven trace stages across the wire to the UI — and `pnpm --filter @qmulate/i18n exec vitest run`
 * was **220 passed (220)**, exit 0. Not one of those vocabularies had ar/en copy and not one test
 * mentioned them. The register in §6 was reachable only for `endowments.eligibility.reasons`.
 *
 * So: every `export const NAME = [ … ] as const` in the engine's contract is enumerated MECHANICALLY
 * and must carry a disposition. A new vocabulary reddens this file until somebody says which of five
 * things it is — and four of the five dispositions require NO ar/en copy at all, so the honest answer
 * is always available and never requires inventing a sentence.
 */

/** A disposition that is NOT a catalogue group. Each says why no copy is owed. */
const NO_COPY_NEEDED = {
  /**
   * Rendered as an UNTRANSLATED machine code beside ONE catalogued sentence. The engine's own
   * contract states this for `SHART_REFUSALS` in as many words: *"these strings have no ar/en copy
   * and need none — a surface renders `errors.domain.SHART_INCOMPLETE` and shows the discriminator as
   * diagnostic detail alongside it"*, because a refusal emits **no run at all** and therefore never
   * appears on a beneficiary's statement. Enforced below: the sentence must exist, and the
   * discriminator must NOT be catalogued anywhere.
   */
  DIAGNOSTIC_CODE_BESIDE_ONE_SENTENCE: 'rendered as a machine code beside one catalogued sentence',
  /**
   * On the owed register in §6 — TIER 1, product-approved legal text. Enforced by
   * {@link AUDITED_CODE_GROUPS}, and asserted below to be present there.
   */
  ON_THE_OWED_REGISTER: 'TIER 1 · enumerated on an owed register in §6',
  /**
   * NEVER RENDERED TO ANY USER. The one standing example is the ẓuhūr/buṭūn descent fact.
   *
   * ⚠ `LINEAGE_LINKS` (`SON`/`DAUGHTER`) and `BENEFICIARY_LINES` (`ZUHUR`/`BUTUN`/`NA`) are the SAME
   * FACT one derivation apart: `basis.line` is what `lineageLink` implies. `messages.test.ts` and
   * `apps/web/src/lib/endowments/labels.ts` both already record that a group for `LineageLink`
   * "appearing here is itself a defect" (ADR-0009), and a label reading «بطون» beside a person's name
   * renders that they descend through a daughter — the exact disclosure the rule prevents. The
   * engine's own `LineBasis.lineageLink` comment says it is "present so the *basis* is auditable, NOT
   * as a demographic attribute. A statement or report must not render it as the beneficiary's gender."
   *
   * ⚠ ENFORCED BELOW as an ABSENCE: no member of these vocabularies may appear as a catalogue key,
   * in either locale. This is the only disposition whose test is that copy must NOT exist.
   */
  NEVER_RENDERED: 'never rendered to any user — a catalogue key for it is itself the defect',
  /**
   * Already catalogued under an `endowments.*` group, because the vocabulary is shared with the
   * endowment RECORD screens and the engine re-declares it rather than owning it. Asserted below
   * against that group.
   */
  CATALOGUED_UNDER_ENDOWMENTS: 'shared with the endowment record screens',
} as const;

/**
 * vocabulary name (as declared in the engine's contract) → its disposition.
 *
 * A `distribution.*`/`endowments.*` value means "catalogued under that group" and is checked against
 * {@link GROUP_SOURCES}. Anything else must be a {@link NO_COPY_NEEDED} member.
 */
const VOCABULARY_DISPOSITION: Readonly<Record<string, string>> = {
  /* ── TIER 2 · catalogued under distribution.* (engineering's rendering, owed to E10/E12) ──── */
  LINE_STATUSES: 'distribution.lineStatus',
  RECEIPT_CLASSES: 'distribution.receiptClass',
  CAPITAL_SOURCES: 'distribution.capitalSource',
  FEE_BASES: 'distribution.feeBasis',
  TIMING_STATUSES: 'distribution.timingStatus',
  DEADLINE_BASES: 'distribution.deadlineBasis',
  BINDING_CALENDARS: 'distribution.bindingCalendar',
  AUTHORITY_NOTICE_TYPES: 'distribution.authorityNoticeType',
  RUN_FLAGS: 'distribution.flag',
  INVARIANT_IDS: 'distribution.invariant',
  TRACE_STAGES: 'distribution.traceStage',

  /* ── TIER 1 · on the owed register ────────────────────────────────────────────────────────── */
  EXCLUSION_REASON_CODES: NO_COPY_NEEDED.ON_THE_OWED_REGISTER,
  ENTITLEMENT_RULES: NO_COPY_NEEDED.ON_THE_OWED_REGISTER,

  /* ── discriminators · one sentence + a machine code ───────────────────────────────────────── */
  SHART_REFUSALS: NO_COPY_NEEDED.DIAGNOSTIC_CODE_BESIDE_ONE_SENTENCE,
  /**
   * ⊖ 2026-08-24 (Milestone 1): was DIAGNOSTIC_CODE_BESIDE_ONE_SENTENCE, on the reasoning that the
   * `errors.domain.<CODE>` sentences already cover these and a second wording would split one
   * condition. The ANSWERED wording brief overrides that reasoning DELIBERATELY: the error copy is
   * a validation-toast register, "the wrong voice for a statement line telling a living, entitled
   * person their money is held" (the brief's own words) — so the STATEMENT voice is its own group,
   * `distribution.withheldReason`, approved through the review path. Two registers, one condition,
   * two AUDIENCES — a documented exception to the one-wording rule, not an erosion of it. The
   * `errors.domain.*` twins stay pinned for the error path.
   */
  GATE_REASON_CODES: 'distribution.withheldReason',

  /* ── never rendered ───────────────────────────────────────────────────────────────────────── */
  LINEAGE_LINKS: NO_COPY_NEEDED.NEVER_RENDERED,
  BENEFICIARY_LINES: NO_COPY_NEEDED.NEVER_RENDERED,

  /* ── shared with the endowment record screens ─────────────────────────────────────────────── */
  WAQF_CLASSIFICATIONS: 'endowments.classificationValue',
  WAQF_TYPES: 'endowments.waqfTypeValue',
  ENTITLEMENT_ORDERS: 'endowments.entitlementOrderValue',
  CONTINUATION_STIPULATIONS: 'endowments.continuationValue',
  REVERSION_KINDS: 'endowments.reversionKindValue',
  BENEFICIARY_KINDS: 'endowments.beneficiaries.kindValue',
  VERIFICATION_STATUSES: 'endowments.beneficiaries.verificationValue',
  RESIDENCIES: 'endowments.beneficiaries.residencyValue',

  /**
   * ⚠ NOT RENDERED BY S7, AND THAT IS THE HONEST DISPOSITION RATHER THAN A LABEL NOBODY USES.
   * MEASURED: neither value crosses `packages/api/src/routers/distribution.ts`'s returned payloads —
   * `maintenanceRule.kind` and `disbursementSchedule` are INPUT fields the mapper builds and the
   * engine consumes, and what a screen shows instead is the `MAINTENANCE_POLICY_UNACKNOWLEDGED`
   * diagnostic and the `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED` flag, both of which ARE
   * catalogued. Cataloguing an unrendered vocabulary would create dead copy a translator maintains —
   * which is precisely what the orphan direction of §5 exists to prevent. If a later stage puts
   * either on a screen, this line is where the decision gets made rather than skipped.
   */
  MAINTENANCE_RULE_KINDS: 'NOT_RENDERED_BY_ANY_SURFACE_TODAY',
  DISBURSEMENT_SCHEDULES: 'NOT_RENDERED_BY_ANY_SURFACE_TODAY',
};

/** The one disposition above that is neither a group nor a `NO_COPY_NEEDED` member. */
const NOT_RENDERED_TODAY = 'NOT_RENDERED_BY_ANY_SURFACE_TODAY';

const NO_COPY_DISPOSITIONS = new Set<string>([
  ...Object.values(NO_COPY_NEEDED),
  NOT_RENDERED_TODAY,
]);

describe('every vocabulary the distribution engine declares is classified', () => {
  const declared = parseExportedConstArrayNames(distributionContract);

  it('found the engine vocabularies mechanically, not from a hand-list', () => {
    // A floor, not the count — a count here would be the hand-copied fact this file replaces.
    expect(
      declared.length,
      'parsed almost no `export const … = [` out of the distribution contract — the parser went blind ' +
        'and every assertion below is vacuous',
    ).toBeGreaterThanOrEqual(20);
    // Spot-anchors: the three whose absence would be most dangerous.
    expect(declared).toContain('EXCLUSION_REASON_CODES');
    expect(declared).toContain('RUN_FLAGS');
    expect(declared).toContain('SHART_REFUSALS');
  });

  it('classifies EVERY declared vocabulary — a new one reddens this file until it is', () => {
    const unclassified = declared.filter((name) => !(name in VOCABULARY_DISPOSITION));

    expect(
      unclassified,
      [
        '',
        '⚠ packages/domain/src/distribution/contract.ts declares the vocabular(ies) above and nothing',
        'in packages/i18n says what they are. next-intl PRINTS a missing key rather than throwing, so a',
        'member of one reaching a screen renders as a raw dotted key with every suite green — which is',
        'exactly what happened to the WHOLE distribution vocabulary before S7 (220/220 green).',
        '',
        'Add a VOCABULARY_DISPOSITION entry. FIVE answers, and four of them need NO copy:',
        '  · a `distribution.*` / `endowments.*` group name → TIER 2 staff-facing vocabulary; write the',
        '    ar+en copy AND add the group to GROUP_SOURCES so it is checked member-for-member.',
        '  · ON_THE_OWED_REGISTER → TIER 1, printed on a beneficiary statement. Add every member to an',
        '    AUDITED_CODE_GROUPS register with its reason and owner. NEVER write the sentence here.',
        '  · DIAGNOSTIC_CODE_BESIDE_ONE_SENTENCE → a refusal discriminator: no run is emitted, so there',
        '    is no statement for it to appear on. It renders as a code beside errors.domain.<CODE>.',
        '  · NEVER_RENDERED → the ẓuhūr/buṭūn descent fact and nothing else so far. A catalogue key for',
        '    it is itself the defect (ADR-0009).',
        '  · NOT_RENDERED_BY_ANY_SURFACE_TODAY → measured: no router payload carries it. Say so here',
        '    rather than writing dead copy a translator would maintain forever.',
        '',
      ].join('\n'),
    ).toEqual([]);
  });

  it('no disposition names a vocabulary the engine no longer declares', () => {
    // The mirror. A stale entry means a vocabulary was renamed and this classification now protects
    // nothing — and the NEW name would be caught by the test above only until somebody "fixed" it by
    // editing the old line instead of adding one.
    const known = new Set(declared);
    expect(
      Object.keys(VOCABULARY_DISPOSITION).filter((name) => !known.has(name)),
      'VOCABULARY_DISPOSITION classifies a vocabulary that no longer exists in the engine contract',
    ).toEqual([]);
  });

  it.each(Object.keys(VOCABULARY_DISPOSITION))(
    '%s — its disposition is either a REAL catalogue group or a stated reason for needing none',
    (name) => {
      const disposition = VOCABULARY_DISPOSITION[name] as string;
      if (NO_COPY_DISPOSITIONS.has(disposition)) return;
      expect(
        Object.keys(GROUP_SOURCES),
        `${name} is classified as living under "${disposition}", but that group is not in ` +
          `GROUP_SOURCES — so nothing checks it member-for-member and the classification is a claim ` +
          `with no enforcement behind it`,
      ).toContain(disposition);
    },
  );

  it.each(
    Object.keys(VOCABULARY_DISPOSITION).filter(
      (name) => VOCABULARY_DISPOSITION[name] === NO_COPY_NEEDED.ON_THE_OWED_REGISTER,
    ),
  )(
    '%s — every member is ON an owed register, or carries the approved copy that closed it',
    (name) => {
      // ⊖ 2026-08-24: was "every member is actually ON an owed register", written when ALL of TIER 1
      // was owed. A member now legitimately leaves the register by gaining approved wording
      // (APPROVED-WORDING.md), so the property is: registered XOR worded, never neither — the same
      // has-copy-or-owed law §6b drives, restated here from the disposition side.
      const members = parseConstArray(distributionContract, name);
      const registered = new Set(AUDITED_CODE_GROUPS.flatMap((a) => Object.keys(a.owed)));
      const worded = new Set(
        AUDITED_CODE_GROUPS.flatMap((a) =>
          a.emitted.filter((code) => locales.every((locale) => hasCopyIn(a.group)(locale, code))),
        ),
      );
      expect(
        members.filter((member) => !registered.has(member) && !worded.has(member)),
        `${name} is classified TIER 1 but the member(s) above are on no register in AUDITED_CODE_GROUPS. ` +
          `A TIER-1 classification with no register entry is the weakest possible state: it claims the ` +
          `wording is owed to a review path while no test knows the code exists.`,
      ).toEqual([]);
    },
  );

  it.each(
    Object.keys(VOCABULARY_DISPOSITION).filter(
      (name) => VOCABULARY_DISPOSITION[name] === NO_COPY_NEEDED.NEVER_RENDERED,
    ),
  )('%s — NO member appears as a catalogue key, in either locale', (name) => {
    // The one disposition whose test is that copy must NOT exist. `ZUHUR`/`BUTUN`/`SON`/`DAUGHTER`
    // are short and generic enough that a well-meaning future label would slip in unnoticed; this is
    // what notices.
    const members = parseConstArray(distributionContract, name);
    const leaked = locales.flatMap((locale) =>
      [...keys[locale]]
        .filter((key) => members.some((member) => key.endsWith(`.${member}`)))
        .map((key) => `${locale}: ${key}`),
    );

    expect(
      leaked,
      `${name} is the ẓuhūr/buṭūn descent fact — an ELIGIBILITY FACT read for one computation, never ` +
        `rendered as a person's attribute (ADR-0009). The catalogue key(s) above would put it on a ` +
        `screen. Delete the copy; do not relax this assertion.`,
    ).toEqual([]);
  });

  it.each(
    Object.keys(VOCABULARY_DISPOSITION).filter(
      (name) => VOCABULARY_DISPOSITION[name] === NO_COPY_NEEDED.DIAGNOSTIC_CODE_BESIDE_ONE_SENTENCE,
    ),
  )('%s — no member is catalogued as its OWN sentence anywhere', (name) => {
    // The claim behind this disposition is that ONE catalogued sentence covers the whole vocabulary
    // and the member renders as a diagnostic code beside it. A per-member key would quietly convert
    // that into twenty-six sentences for one user-facing meaning — and it would be an INVENTED one,
    // since nobody has approved per-discriminator wording.
    //
    // ⚠ `GATE_REASON_CODES` are exempt from the "no key" half because they ARE `DOMAIN_ERROR_CODES`:
    // their sentence legitimately lives at `errors.domain.<CODE>`. What must not happen is a SECOND
    // wording under `distribution.*`.
    //
    // ⚠ AND A KEY THAT IS A DIFFERENT VOCABULARY'S LEGITIMATE MEMBER IS NOT A LEAK. This assertion
    // caught `distribution.lineStatus.CROSS_BORDER_PENDING` on its first run, correctly by its own
    // coarse rule and wrongly on the facts: `CROSS_BORDER_PENDING` is a member of BOTH
    // `GATE_REASON_CODES` (why a payment is held) and `LINE_STATUSES` (the state of the line), and
    // both need words. So "leaked" means a `distribution.*` key that NO group in GROUP_SOURCES
    // declares — i.e. wording written for the discriminator itself and for nothing else.
    const members = parseConstArray(distributionContract, name);
    const declaredByAGroup = new Set(
      Object.entries(GROUP_SOURCES).flatMap(([group, source]) =>
        source.members.map((member) => `${group}.${member}`),
      ),
    );
    const leaked = locales.flatMap((locale) =>
      [...keys[locale]]
        .filter(
          (key) =>
            key.startsWith('distribution.') &&
            !declaredByAGroup.has(key) &&
            members.some((member) => key.endsWith(`.${member}`)),
        )
        .map((key) => `${locale}: ${key}`),
    );

    expect(
      leaked,
      `${name} renders as a machine code beside one catalogued sentence. The distribution.* key(s) ` +
        `above give a discriminator its own wording, which nobody has approved and which splits one ` +
        `user-facing condition across many sentences.`,
    ).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7c · ⊕ S7 · THE MAPPER'S REFUSALS RENDER AS A SENTENCE, WITHOUT INVENTING ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/api/src/distribution/refusal.ts` declares an EIGHTEENTH-and-nineteenth vocabulary the
 * engine knows nothing about: `MAPPER_REFUSALS`, carried at `details.mapperRefusal`, deliberately
 * DISJOINT from the engine's twenty-six.
 *
 * ⚠ ITS HEADER ASKED S7-5 FOR TIER-2 ar/en LABELS. That is NOT what landed, and the reason is the
 * parallel the same file draws two paragraphs earlier: a mapper refusal, exactly like a
 * `SHART_REFUSALS` discriminator, means **no run was emitted** — so it never reaches a beneficiary
 * statement, and the one user-facing sentence is the `errors.domain.<CODE>` message the `DomainError`
 * already carries. Writing eighteen more sentences would give one condition two wordings and would
 * contradict `messages.test.ts`'s standing position on the twenty-six.
 *
 * What IS enforced instead, and it is the property the header actually wanted: every mapper refusal
 * must report a domain code that HAS ar+en copy, so the refusal always renders as a real sentence
 * plus a diagnostic code — never as a bare Latin string with nothing beside it.
 */
describe('every mapper refusal renders as a catalogued sentence plus a diagnostic code', () => {
  const mapperRefusals = parseConstArray(distributionRefusal, 'MAPPER_REFUSALS');
  /** `REVERSION_CLAUSE_UNREAD: 'SHART_INCOMPLETE',` out of `MAPPER_REFUSAL_CODE`. */
  const refusalToCode = (() => {
    const stripped = stripComments(distributionRefusal);
    const match = /\bconst MAPPER_REFUSAL_CODE[^=]*=\s*\{/.exec(stripped);
    if (match === null) {
      throw new Error(
        'could not find `const MAPPER_REFUSAL_CODE … = {` in packages/api/src/distribution/refusal.ts. ' +
          'It was renamed — repoint this parser rather than deleting the assertion, or a mapper refusal ' +
          'could ship pointing at a domain code with no ar/en sentence.',
      );
    }
    const body = sliceBalanced(stripped, match.index + match[0].length - 1, '{', '}');
    return new Map(
      [...body.matchAll(/([A-Z][A-Z0-9_]*)\s*:\s*'([A-Z][A-Z0-9_]*)'/g)].map((entry) => [
        entry[1] as string,
        entry[2] as string,
      ]),
    );
  })();

  it('parsed both halves — the vocabulary and its code table', () => {
    expect(mapperRefusals.length, 'MAPPER_REFUSALS parsed empty').toBeGreaterThanOrEqual(15);
    expect(refusalToCode.size, 'MAPPER_REFUSAL_CODE parsed empty').toBeGreaterThanOrEqual(
      mapperRefusals.length,
    );
  });

  it('is DISJOINT from the engine’s discriminators — one name may not carry two meanings', () => {
    // `refusal.ts` asserts this at import; asserted here too, because this file is the one that would
    // otherwise have to decide which of the two meanings a shared name's copy referred to.
    const shartRefusals = new Set(parseConstArray(distributionContract, 'SHART_REFUSALS'));
    expect(mapperRefusals.filter((refusal) => shartRefusals.has(refusal))).toEqual([]);
  });

  it.each(
    parseConstArray(distributionRefusal, 'MAPPER_REFUSALS').map((refusal) => [refusal] as [string]),
  )('%s reports a domain code with ar AND en copy', (refusal) => {
    const code = refusalToCode.get(refusal);
    expect(code, `${refusal} has no entry in MAPPER_REFUSAL_CODE`).toBeDefined();
    for (const locale of locales) {
      expect(
        keys[locale].has(`errors.domain.${code}`),
        `${refusal} reports ${String(code)}, which has no ${locale} sentence under errors.domain. ` +
          `A refusal whose only user-facing text is missing renders as a bare machine code on an ` +
          `Arabic-first screen — either the code is wrong or errors.domain.${String(code)} must be written.`,
      ).toBe(true);
    }
  });

  it('no mapper refusal is given its own invented sentence under distribution.*', () => {
    const leaked = locales.flatMap((locale) =>
      [...keys[locale]]
        .filter(
          (key) =>
            key.startsWith('distribution.') &&
            mapperRefusals.some((refusal) => key.endsWith(`.${refusal}`)),
        )
        .map((key) => `${locale}: ${key}`),
    );

    expect(
      leaked,
      'a mapper refusal has been given its own wording. It is a DISCRIMINATOR: the sentence is the ' +
        'errors.domain.<CODE> message the DomainError already carries, and the discriminator renders ' +
        'beside it as a diagnostic code. Splitting one condition across eighteen sentences is the ' +
        'defect messages.test.ts records for the engine’s twenty-six.',
    ).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 8 · The mechanism, mutated — proof it would go red
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the mechanism catches a code with no copy (mutation self-test)', () => {
  it('reports a fabricated emitted code as missing in both locales', () => {
    // A test whose assertion is "nothing found" is worthless if the detector cannot find anything.
    const pretendRouter = [
      "const BY_NAME = 'FABRICATED_CODE_TWO' as const;",
      'function deedRefused(id, subject, reasons) {}',
      "deedRefused('w', 'deed', ['FABRICATED_CODE_ONE']);",
      "deedRefused('w', 'deed', [BY_NAME]);",
    ].join('\n');

    const fabricated = parseEmittedReasonCodes(pretendRouter, ['deedRefused']);
    expect(fabricated).toEqual(['FABRICATED_CODE_ONE', 'FABRICATED_CODE_TWO']);

    const missing = fabricated.flatMap((code) =>
      locales
        .filter((locale) => !keys[locale].has(`endowments.eligibility.reasons.${code}`))
        .map((locale) => `${locale}: ${code}`),
    );

    expect(missing).toEqual([
      'ar: FABRICATED_CODE_ONE',
      'en: FABRICATED_CODE_ONE',
      'ar: FABRICATED_CODE_TWO',
      'en: FABRICATED_CODE_TWO',
    ]);
  });

  it('a group whose source gains a member goes red until the catalogue does', () => {
    const withNewMember = `${parsePrismaEnum(schema, 'WaqfNature').join(',')},PRETEND_NEW_MEMBER`
      .split(',')
      .filter((member) => !keys.ar.has(`endowments.waqfNatureValue.${member}`));

    expect(withNewMember).toEqual(['PRETEND_NEW_MEMBER']);
  });

  /* ── ⊕ S7 · the vocabulary-level mechanism, mutated ──────────────────────────────────────── */

  it('parseExportedConstArrayNames SEES a newly added vocabulary (and skips non-arrays)', () => {
    // The whole §7b mechanism rests on this parse. If it went blind, "every vocabulary is
    // classified" would pass over an empty set and a new engine vocabulary would ship unnoticed —
    // which is precisely the state the distribution vocabulary was in before S7.
    const pretend = [
      "export const REAL_ONE = ['A_MEMBER'] as const;",
      'export const BRAND_NEW_VOCABULARY = [',
      "  'FIRST',",
      "  'SECOND',",
      '] as const;',
      "export const NOT_AN_ARRAY = { a: 'b' };",
      "const NOT_EXPORTED = ['X'] as const;",
      '/* export const IN_A_COMMENT = [ */',
    ].join('\n');

    expect(parseExportedConstArrayNames(pretend)).toEqual(['BRAND_NEW_VOCABULARY', 'REAL_ONE']);
  });

  it('an UNCLASSIFIED new vocabulary is reported — the §7b direction that must break CI', () => {
    // Driven against a fabricated source so the proof runs on every commit rather than requiring
    // somebody to edit the engine's contract by hand to check.
    const pretendContract = [
      "export const RUN_FLAGS = ['A_FLAG'] as const;",
      "export const NEWLY_INVENTED_CODES = ['SOMETHING_NEW'] as const;",
    ].join('\n');

    const unclassified = parseExportedConstArrayNames(pretendContract).filter(
      (name) => !(name in VOCABULARY_DISPOSITION),
    );

    expect(unclassified).toEqual(['NEWLY_INVENTED_CODES']);
    // …and the one that IS classified stays silent, which is the half that keeps the suite green.
    expect(parseExportedConstArrayNames(pretendContract)).toContain('RUN_FLAGS');
  });

  it('a TIER-2 group whose engine vocabulary gains a member goes red until the catalogue does', () => {
    // The real `RUN_FLAGS` + one fabricated member, against the real catalogue.
    const withNewFlag = [...parseConstArray(distributionContract, 'RUN_FLAGS'), 'PRETEND_NEW_FLAG'];
    const missing = locales.flatMap((locale) =>
      withNewFlag
        .filter((member) => !keys[locale].has(`distribution.flag.${member}`))
        .map((member) => `${locale}: ${member}`),
    );

    expect(missing).toEqual(['ar: PRETEND_NEW_FLAG', 'en: PRETEND_NEW_FLAG']);
  });

  it('CODE_LITERAL reads the HYPHENATED invariant ids — the parse that was blind until S7', () => {
    // The measurement, kept as an assertion: the old pattern returned nine, the corrected one twelve.
    const invariants = parseConstArray(distributionContract, 'INVARIANT_IDS');
    const hyphenated = invariants.filter((id) => id.includes('-'));

    expect(hyphenated).toEqual(['I-C1', 'I-L1', 'I-R1']);
    expect(invariants).toHaveLength(12);

    // The old, narrow pattern — reproduced here so the regression is provable and not just described.
    const narrow = [
      ...(sliceBalanced(
        stripComments(distributionContract),
        (
          /\bexport const INVARIANT_IDS\s*=\s*\[/.exec(
            stripComments(distributionContract),
          ) as RegExpExecArray
        ).index +
          (
            /\bexport const INVARIANT_IDS\s*=\s*\[/.exec(
              stripComments(distributionContract),
            ) as RegExpExecArray
          )[0].length -
          1,
        '[',
        ']',
      ).matchAll(/'([A-Z][A-Z0-9_]*)'/g) as unknown as Iterable<RegExpMatchArray>),
    ].map((literal) => literal[1] as string);

    expect(narrow, 'the pre-S7 pattern must still be demonstrably blind').toHaveLength(9);
    expect(narrow).not.toContain('I-C1');
  });

  it('a TIER-1 code that gains copy is reported as rot, per group', () => {
    // The register's own failure mode, driven over the REAL exclusion vocabulary with a fabricated
    // catalogue: the day E10/E12 lands the wording, this is what says "delete the entry".
    // ⊖ 2026-08-24: the probe code moved from TABAQA_EXTINCT (whose approved wording arrived, so it
    // left the register) to BENEFICIARY_INACTIVE — still owed, and the answered brief's own ON-HOLD
    // item, so the last one likely to leave.
    const exclusions = parseConstArray(distributionContract, 'EXCLUSION_REASON_CODES');
    const audit = auditReasonCopy(
      exclusions,
      Object.keys(EXCLUSION_COPY_OWED_TO_REVIEW).sort(),
      (locale, code) => code === 'BENEFICIARY_INACTIVE' && locale === 'ar',
    );

    expect(audit.rotted).toEqual(['ar: BENEFICIARY_INACTIVE']);
    expect(audit.dead).toEqual([]);
  });

  it('the scoped hasCopyIn does NOT accept another group’s label for a TIER-1 code', () => {
    // The collision that would silently satisfy a TIER-1 entry: `NA_DIRECT_USE` HAS copy — under
    // `endowments.entitlementOrderValue`, written for a record screen. The entitlement RULE printed
    // on a statement is a different sentence for a different reader, so the scoped check must report
    // it as still missing. An unscoped "appears anywhere" check would have called this answered.
    expect(keys.ar.has('endowments.entitlementOrderValue.NA_DIRECT_USE')).toBe(true);
    expect(hasCopyIn('distribution.entitlementRule')('ar', 'NA_DIRECT_USE')).toBe(false);
    expect(hasCopyIn('distribution.entitlementRule')('en', 'NA_DIRECT_USE')).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 9 · The OWED REGISTER, mutated — proof each of its three directions would go red
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A register is a mechanism for staying green, and a mechanism for staying green is worth exactly
 * what its failure modes are worth. Each direction is driven here against a fabricated catalogue, so
 * the proof runs in CI on every commit rather than living in one session's transcript.
 */

describe('the owed register, mutated (self-test — a green register must be able to go red)', () => {
  /** A catalogue stub: `carries` is the set of `locale:code` pairs that have wording. */
  const catalogue =
    (...carries: string[]) =>
    (locale: Locale, code: string): boolean =>
      carries.includes(`${locale}:${code}`);

  it('DIRECTION 1 — an emitted code with no copy and no register entry is reported', () => {
    const audit = auditReasonCopy(
      ['REGISTERED_ONE', 'BRAND_NEW_CODE'],
      ['REGISTERED_ONE'],
      catalogue(),
    );

    expect(audit.unregistered).toEqual(['ar: BRAND_NEW_CODE', 'en: BRAND_NEW_CODE']);
    // …and the registered one is NOT reported, which is the half that makes the suite green.
    expect(audit.rotted).toEqual([]);
    expect(audit.dead).toEqual([]);
  });

  it('DIRECTION 2 — a registered code that has gained copy is reported as rot, in either locale', () => {
    const bothLocales = auditReasonCopy(
      ['REGISTERED_ONE'],
      ['REGISTERED_ONE'],
      catalogue('ar:REGISTERED_ONE', 'en:REGISTERED_ONE'),
    );
    expect(bothLocales.rotted).toEqual(['ar: REGISTERED_ONE', 'en: REGISTERED_ONE']);

    // Half-written copy is rot too: English answered, Arabic — the authoritative one — still blank.
    const halfWritten = auditReasonCopy(
      ['REGISTERED_ONE'],
      ['REGISTERED_ONE'],
      catalogue('en:REGISTERED_ONE'),
    );
    expect(halfWritten.rotted).toEqual(['en: REGISTERED_ONE']);
  });

  it('DIRECTION 3 — dropping the entry for a genuinely-missing code re-reports it', () => {
    const withEntry = auditReasonCopy(['REGISTERED_ONE'], ['REGISTERED_ONE'], catalogue());
    expect(withEntry.unregistered, 'a registered code must be silent').toEqual([]);

    const withoutEntry = auditReasonCopy(['REGISTERED_ONE'], [], catalogue());
    expect(withoutEntry.unregistered).toEqual(['ar: REGISTERED_ONE', 'en: REGISTERED_ONE']);
  });

  it('DIRECTION 4 — a register entry nothing emits is reported dead', () => {
    const audit = auditReasonCopy([], ['CODE_NOBODY_EMITS'], catalogue());

    expect(audit.dead).toEqual(['CODE_NOBODY_EMITS']);
  });

  it('the REAL register is wired to the REAL parse — not to a stub', () => {
    // The self-tests above prove the function. This proves the production call sites use it on the
    // real inputs, so a refactor that quietly points the assertions at fabricated data is caught.
    // ⊖ 2026-08-24: this used to pin the two REP codes as owed-with-no-copy; both sentences arrived
    // (APPROVED-WORDING.md) and the check inverts — they must be EMITTED and CARRY copy now, and
    // every code still owed anywhere must be emitted by its group's real source and carry NONE.
    expect(OWED_CODES).toEqual([]);
    for (const code of ['REP_ELIGIBILITY_NOT_ASSESSED', 'REP_ELIGIBILITY_WITHOUT_REPRESENTATIVE']) {
      expect(apiEmittedReasonCodes, `${code} must still be emitted`).toContain(code);
      for (const locale of locales) {
        expect(hasReasonCopy(locale, code), `${locale}: ${code} must HAVE copy now`).toBe(true);
      }
    }
    for (const audited of AUDITED_CODE_GROUPS) {
      for (const code of Object.keys(audited.owed)) {
        expect(audited.emitted, `${audited.group}: ${code} must still be emitted`).toContain(code);
        for (const locale of locales) {
          expect(
            hasCopyIn(audited.group)(locale, code),
            `${locale}: ${audited.group}.${code} must still have NO copy`,
          ).toBe(false);
        }
      }
    }
  });

  /**
   * ⊕ S7 · THE WHOLE REGISTER, PINNED — every group, sorted, hand-written.
   *
   * The pin exists so that ADDING an entry is a deliberate two-place edit with a reviewer looking at
   * it, and so that the total is stated somewhere a human reads rather than only computed. It is the
   * one hand-copied fact in this file and it is hand-copied ON PURPOSE: everything else here is
   * derived precisely so that the register — the only mechanism that lets a missing sentence stay
   * missing — cannot grow quietly.
   *
   * ⚠ SEVEN, down from seventeen on 2026-08-24: Fadwa's ANSWERED wording brief
   * (`docs/product/statement-copy/APPROVED-WORDING.md`) paid twelve debts — the V-E3-M5 eligibility
   * pair and ten TIER-1 distribution sentences — and the withheld/gate vocabulary joined the audit
   * with two of its five owed. Every remaining code was left BLANK (or ON HOLD) in the answered
   * document; none may be authored in a code change. If this number goes UP, ask what sentence
   * somebody could not write and why; when it reaches ZERO, retire the register per its own
   * instruction.
   */
  it('the complete owed register is pinned — 7 codes across 4 groups', () => {
    expect(
      AUDITED_CODE_GROUPS.map((audited) => [audited.group, Object.keys(audited.owed).sort()]),
    ).toEqual([
      ['endowments.eligibility.reasons', []],
      [
        'distribution.exclusionReason',
        [
          'BENEFICIARY_INACTIVE',
          'REVERSION_PENDING_BLOODLINE_UNENUMERATED',
          'REVERSION_PENDING_LIVING_BLOODLINE',
        ],
      ],
      ['distribution.entitlementRule', ['NA_DIRECT_USE', 'ULTIMATE_TAKER_MAAL_AL_WAQF']],
      ['distribution.withheldReason', ['CATEGORY_NOT_CAPTURED', 'ENTITY_UNLICENSED']],
    ]);
    expect(ALL_OWED).toHaveLength(7);
  });

  /* ⊖ The "carries no catalogue key in either locale" assertion retired 2026-08-24, by its own
   * instruction: the TIER-1 groups gained their first approved keys (APPROVED-WORDING.md), so the
   * empty-namespace property no longer holds and the groups are now declared in GROUP_SOURCES and
   * checked member-for-member over the APPROVED subset — while directions 1+2 keep every remaining
   * code either owed or worded. A partial landing is now the DECLARED state, not a smell. */
});

/* ═════════════════════════════════════════════════
 * 9 · ⊕ S11 · 2b — ENGINEERING'S ARABIC, DECLARED OWED TO REVIEW (a register with teeth)
 * ═════════════════════════════════════════════════
 *
 * The `assetStatusValue` / `RECEIPT_CLASS_CORRECTION` standing (§ GROUP_SOURCES comments above) was a
 * COMMENT: "the Arabic is engineering's rendering, owed to the E10/E12 copy review". A comment cannot
 * fail. This register can, in three directions:
 *  1. every listed group must be in GROUP_SOURCES (so it is already checked member-for-member);
 *  2. every member must carry copy in BOTH locales — this is NOT the owed-copy register of §6, whose
 *     entries must have NO copy; these are staff-facing labels the screen renders TODAY;
 *  3. the Arabic must DIFFER from the English for every member — an `ar` value equal to `en` is an
 *     untranslated placeholder that would ship on an Arabic-first screen with every suite green.
 * Each entry names who closes it and how. Closing = the review confirms or replaces the wording and
 * the entry is deleted; the group stays in GROUP_SOURCES unconditionally.
 */
const ENGINEERING_AR_OWED_TO_REVIEW: Readonly<
  Record<string, { readonly owner: string; readonly closedBy: string }>
> = {
  'dashboard.rule': {
    owner: 'E10/E12 copy review (staff-facing board labels; not beneficiary statement text)',
    closedBy: 'the review confirms or replaces the nine rule labels; delete this entry',
  },
  'dashboard.state': {
    owner: 'E10/E12 copy review',
    closedBy: 'the review confirms or replaces the seven state words; delete this entry',
  },
  'dashboard.cause': {
    owner: 'E10/E12 copy review',
    closedBy: 'the review confirms or replaces the six cause sentences; delete this entry',
  },
  'dashboard.tone': {
    owner: 'E10/E12 copy review (these four words are the FIGURE each chip renders)',
    closedBy: 'the review confirms or replaces the four tone words; delete this entry',
  },
  'dashboard.filings.platform': {
    owner: 'E10/E12 copy review (the six platforms’ Arabic names are the platforms’ own)',
    closedBy:
      'the review confirms the six names against the platforms’ own branding; delete this entry',
  },
  'dashboard.filings.status': {
    owner: 'E10/E12 copy review',
    closedBy: 'the review confirms or replaces the six status words; delete this entry',
  },
};

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * STAFF-FACING SCREEN **PROSE** AWAITING REVIEW — a THIRD register, and why it had to exist
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * S11 item 2c drafted the whole `financials` namespace under the owner's standing permission of
 * 2026-09-03 (*"you draft it"*), and the orchestrator's condition was that every new key be
 * **registered as awaiting review rather than silently inherited as approved**. Neither existing
 * register can hold it, and forcing it into either would have broken something real:
 *
 *  · `ENGINEERING_AR_OWED_TO_REVIEW` (above) asserts its entries member-for-member against
 *    `GROUP_SOURCES`, whose members are PARSED off a declaring source file. `financials` keys are
 *    prose labels, not a machine vocabulary — there is no enum to parse them from.
 *  · `COPY_OWED_TO_REVIEW` is for BENEFICIARY-FACING statement text, and this file already states
 *    why staff labels must stay off it (see the `RECEIPT_CLASS_CORRECTION` note): *"parking a staff
 *    label on the owed register to go green would hollow out a register that exists for sentences a
 *    beneficiary actually reads."* That reasoning is correct and this register respects it.
 *
 * So: a register for INTERNAL-SCREEN PROSE, with its own teeth rather than a comment. It asserts the
 * namespace exists in both catalogues, that every leaf is present in both, and that no leaf is
 * IDENTICAL across ar and en — the copy-paste placeholder that would otherwise ship on an
 * Arabic-first screen with every suite green. Closing = the review confirms or replaces the wording
 * and the entry is deleted; the namespace stays in the catalogues unconditionally.
 *
 * ⚠ This is NOT a route for beneficiary text. If any of this copy is ever put in front of a
 * beneficiary, it is a different artifact and goes through `COPY_OWED_TO_REVIEW`.
 */
const ENGINEERING_AR_PROSE_OWED_TO_REVIEW: Readonly<
  Record<string, { readonly owner: string; readonly closedBy: string; readonly minLeaves: number }>
> = {
  financials: {
    owner:
      'E10/E12 copy review (staff-facing FINANCIAL screen prose — figures, class labels and the ' +
      'sentences that state what a figure is NOT; never beneficiary statement text)',
    closedBy:
      'the review confirms or replaces the financials namespace wording — especially the ' +
      'corpus/income sentences and the three empty-state statements; delete this entry',
    minLeaves: 40,
  },
};

/** Dotted key → leaf value, per locale (the flatten the whole file already uses). */
const flat = {
  ar: new Map<string, unknown>(flatten(catalogues.ar)),
  en: new Map<string, unknown>(flatten(catalogues.en)),
} as const;

describe('⊕ S11 · 2b — engineering’s Arabic on the compliance board is declared owed, and the declaration has teeth', () => {
  it('lists at least the six board groups (the register is not vacuous)', () => {
    // A floor, not an equality: an entry LEAVES this register only when the review closes it, and
    // that is a copy decision, so the floor moves in the same edit that deletes the entry.
    expect(Object.keys(ENGINEERING_AR_OWED_TO_REVIEW).length).toBeGreaterThanOrEqual(6);
  });

  it.each(Object.keys(ENGINEERING_AR_OWED_TO_REVIEW))(
    '%s is checked member-for-member in GROUP_SOURCES',
    (group) => {
      expect(
        Object.keys(GROUP_SOURCES),
        `${group} is on the register but not in GROUP_SOURCES`,
      ).toContain(group);
    },
  );

  it.each(Object.keys(ENGINEERING_AR_OWED_TO_REVIEW))(
    '%s carries copy in BOTH locales, and the Arabic differs from the English for every member',
    (group) => {
      const { members } = GROUP_SOURCES[group] as { origin: string; members: string[] };
      const untranslated = members.filter((member) => {
        const ar = flat.ar.get(`${group}.${member}`);
        const en = flat.en.get(`${group}.${member}`);
        return typeof ar !== 'string' || typeof en !== 'string' || ar.trim() === '' || ar === en;
      });
      expect(
        untranslated,
        `${group}: an Arabic value missing, empty, or identical to the English — an untranslated ` +
          `placeholder on an Arabic-first screen. Write the Arabic (engineering’s rendering is allowed ` +
          `for these staff-facing labels; it is what this register declares owed).`,
      ).toEqual([]);
    },
  );

  it.each(Object.keys(ENGINEERING_AR_OWED_TO_REVIEW))(
    '%s names an owner and a closing condition',
    (group) => {
      const entry = ENGINEERING_AR_OWED_TO_REVIEW[group] as { owner: string; closedBy: string };
      expect(entry.owner.length).toBeGreaterThan(10);
      expect(entry.closedBy.length).toBeGreaterThan(10);
    },
  );

  /* ── the THIRD register: staff-facing screen PROSE ──────────────────────────────────────── */

  it('the prose register is non-empty while any drafted namespace awaits review', () => {
    expect(Object.keys(ENGINEERING_AR_PROSE_OWED_TO_REVIEW).length).toBeGreaterThanOrEqual(1);
  });

  it.each(Object.keys(ENGINEERING_AR_PROSE_OWED_TO_REVIEW))(
    '%s exists as a namespace in BOTH catalogues',
    (namespace) => {
      expect(Object.keys(catalogues.ar), `ar is missing ${namespace}`).toContain(namespace);
      expect(Object.keys(catalogues.en), `en is missing ${namespace}`).toContain(namespace);
    },
  );

  it.each(Object.keys(ENGINEERING_AR_PROSE_OWED_TO_REVIEW))(
    '%s has the same leaf keys in both catalogues, and at least as many as registered',
    (namespace) => {
      const arLeaves = [...flat.ar.keys()].filter((key) => key.startsWith(`${namespace}.`)).sort();
      const enLeaves = [...flat.en.keys()].filter((key) => key.startsWith(`${namespace}.`)).sort();
      expect(arLeaves).toEqual(enLeaves);
      const { minLeaves } = ENGINEERING_AR_PROSE_OWED_TO_REVIEW[namespace] as { minLeaves: number };
      // A FLOOR, not an equality: adding copy to a namespace already awaiting review is fine;
      // silently DELETING half of it while the register still claims it is not.
      expect(arLeaves.length).toBeGreaterThanOrEqual(minLeaves);
    },
  );

  it.each(Object.keys(ENGINEERING_AR_PROSE_OWED_TO_REVIEW))(
    '%s has no leaf whose ar is IDENTICAL to its en — the copy-paste placeholder',
    (namespace) => {
      // The failure this register exists to catch: an English string pasted into ar.json "to
      // translate later", which next-intl renders without complaint on the DEFAULT locale.
      const identical = [...flat.ar.keys()]
        .filter((key) => key.startsWith(`${namespace}.`))
        .filter((key) => {
          const ar = flat.ar.get(key);
          const en = flat.en.get(key);
          return typeof ar === 'string' && typeof en === 'string' && ar === en;
        });
      expect(identical, `${namespace} carries untranslated leaves`).toEqual([]);
    },
  );

  it.each(Object.keys(ENGINEERING_AR_PROSE_OWED_TO_REVIEW))(
    '%s names who closes it and how',
    (namespace) => {
      const entry = ENGINEERING_AR_PROSE_OWED_TO_REVIEW[namespace] as {
        owner: string;
        closedBy: string;
      };
      expect(entry.owner.length).toBeGreaterThan(20);
      expect(entry.closedBy).toMatch(/delete this entry/);
    },
  );
});
