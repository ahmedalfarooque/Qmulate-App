import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { locales, type Locale } from '../src/config';
import { getMessages, getNamespace, messages } from '../src/index';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * THE BILINGUAL DoD BOX, AS A TEST (§17 "Bilingual + RTL")
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * "All copy lives in `packages/i18n` in ar + en" is not a checkbox someone ticks — it is
 * this file. The failure mode it exists to catch is mundane and constant: a developer adds
 * `auth.resendCode` to `en.json`, ships, and the Arabic UI — the DEFAULT locale, the one
 * the Family Board and the beneficiaries actually use — silently renders the raw key path
 * `auth.resendCode` on screen. next-intl does not throw for a missing message; it prints
 * the key. So nothing fails until a client sees it.
 *
 * The catalogues are read FROM DISK rather than through the package's exports, because the
 * artefacts under review are the two JSON files a translator edits. A second assertion
 * checks the on-disk content against what `src/index.ts` exports, so the two can never
 * drift either.
 */

const AR_PATH = fileURLToPath(new URL('../messages/ar.json', import.meta.url));
const EN_PATH = fileURLToPath(new URL('../messages/en.json', import.meta.url));

type Catalogue = { [key: string]: string | Catalogue };

function readCatalogue(path: string): Catalogue {
  return JSON.parse(readFileSync(path, 'utf8')) as Catalogue;
}

const ar = readCatalogue(AR_PATH);
const en = readCatalogue(EN_PATH);

/** Every leaf as `['a.b.c', value]`, depth-first, in file order. */
function flatten(catalogue: Catalogue, prefix = ''): Array<[string, string]> {
  const leaves: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(catalogue)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      leaves.push(...flatten(value, path));
    } else {
      leaves.push([path, value as string]);
    }
  }
  return leaves;
}

const arLeaves = flatten(ar);
const enLeaves = flatten(en);
const arKeys = arLeaves.map(([key]) => key);
const enKeys = enLeaves.map(([key]) => key);

/**
 * The namespaces the product is built on. Adding one is a real decision (it changes what
 * `useTranslations(ns)` call sites are legal), so it requires editing this list consciously
 * rather than appearing by accident.
 *
 * `endowments` was added in S4/E3 for the endowment record, trusteeship deed, classification,
 * founder's-conditions and reserved-matter screens. It is a FIFTH namespace rather than more
 * keys under `common` because those screens carry the domain's own vocabulary — the terms a
 * translator must handle as legal text, not as chrome.
 *
 * `distribution` was added in S7 for the run wizard, the waterfall, the maker/checker panel, the
 * approvals queue and the two dashboard tiles. It is a SIXTH namespace and not more keys under
 * `endowments` for a reason that is about the copy, not the file layout: an endowment key describes
 * a RECORD, while a distribution key describes a COMPUTATION over money — its labels sit beside
 * figures a Nazir signs, and several of them exist specifically to state what a figure is NOT
 * (`distribution.waterfall.corpusNoTotal`). Mixing the two invites a translator to reuse a record
 * label for a monetary one.
 *
 * ⚠ ORDER IS ASSERTED (below). A namespace must be added at the SAME INDEX in both catalogues.
 */
const EXPECTED_NAMESPACES = [
  'nav',
  'common',
  'auth',
  'errors',
  'endowments',
  'distribution',
  /**
   * ⊕ S11 · 2b (E10) — the compliance BOARD. A SEVENTH namespace because its keys describe neither a
   * record nor a computation over money but the trustee's STANDING against zero-tolerance duties: a
   * tone sentence here ("Breach — zero tolerance") is read beside a red dot on the morning screen.
   * Arabic is ENGINEERING'S RENDERING of staff-facing vocabulary, declared owed to the E10/E12 copy
   * review in `code-source-parity.test.ts` (ENGINEERING_AR_OWED_TO_REVIEW) — never beneficiary text.
   */
  'dashboard',
  /**
   * ⊕ S11 · 2c (E10) — the FINANCIAL screen (`/financials`), its own route per the owner's ruling of
   * 2026-09-03 ("i like b"). An EIGHTH namespace rather than keys inside `dashboard`, because these
   * labels sit beside MONEY and several exist specifically to state what a figure is NOT — that a net
   * balance blends income with corpus, that arrears is not-tracked rather than zero, that an empty
   * position on a direct-utilization endowment is not a zero either. A record label reused for a
   * monetary one is the mistake this separation exists to prevent.
   *
   * Arabic is ENGINEERING'S DRAFT under the owner's standing permission of 2026-09-03 ("you draft
   * it"), and EVERY key is registered awaiting review in `code-source-parity.test.ts`
   * (ENGINEERING_AR_OWED_TO_REVIEW) — staff-facing vocabulary only, never beneficiary text.
   */
  'financials',
  // ⊕ migration 55 · the organisation layer: the account-state notices and the Users / Roles /
  // Audit screens. Staff-facing vocabulary, engineering's rendering, owed to the copy review.
  'account',
  'admin',
] as const;

/** The ten sidebar destinations from the AppShell contract, in their rendered order. */
const SIDEBAR_ITEMS = [
  'dashboard',
  'endowments',
  'beneficiaries',
  'distributions',
  'compliance',
  'calendar',
  'financials',
  'documents',
  'approvals',
  'auditLog',
] as const;

/**
 * Keys the E0 build contract names explicitly. A key can be ADDED freely; deleting one of
 * these breaks a surface that already renders it, so they are pinned.
 */
const CONTRACT_KEYS = [
  ...SIDEBAR_ITEMS.map((item) => `nav.${item}`),
  'common.appName',
  'common.skipToContent',
  'common.loading',
  'common.signIn',
  'common.signOut',
  'common.language',
  'common.languageAr',
  'common.languageEn',
  'common.theme',
  'common.themeLight',
  'common.themeDark',
  'common.portfolioScope',
  'common.selectEndowment',
  'common.client',
  'common.waqif',
  'common.endowment',
  'common.search',
  'common.close',
  'common.cancel',
  'common.confirm',
  'common.save',
  'auth.signInTitle',
  'auth.email',
  'auth.password',
  'auth.submit',
  'auth.totpTitle',
  'auth.totpCode',
  'auth.totpVerify',
  'auth.totpEnrolTitle',
  'auth.totpEnrolIntro',
  'auth.totpEnrolRequired',
  'auth.backupCodes',
  'auth.backupCodesWarning',
  'auth.invalidCredentials',
  'auth.invalidTotp',
  'auth.sessionExpired',
  'auth.signedOut',
  'errors.notFound',
  'errors.notAuthorized',
  'errors.generic',
  'errors.offline',
  'errors.configMissing',
  /**
   * ── S4/E3 · the endowment surfaces ──────────────────────────────────────────────────
   * Pinned for the same reason as the E0 keys above: each one is already rendered by a
   * screen, so deleting it puts a raw dotted key in front of an Arabic-first user.
   *
   * The immutability pair is the load-bearing one. `endowments.shart.immutableTitle` and
   * `endowments.shart.supersedingBody` are how the Shart al-Waqif screen states, in the
   * reader's own language, that the record cannot be edited and that a lawful correction
   * is a NEW record. Binding rule 1 is a database trigger and a UI sentence; this is the
   * sentence.
   */
  'endowments.title',
  'endowments.tabs.record',
  'endowments.tabs.deed',
  'endowments.tabs.classification',
  'endowments.tabs.shart',
  'endowments.tabs.reserved',
  'endowments.fields.certificateNumber',
  'endowments.fields.deedNumber',
  'endowments.fields.classification',
  'endowments.fields.registrationDate',
  'endowments.fields.continuationStipulation',
  'endowments.fields.reversion',
  'endowments.reversion.notCaptured',
  'endowments.reversion.recordsNone',
  'endowments.deed.jointLiabilityTitle',
  'endowments.deed.repAuthorityNote',
  'endowments.eligibility.blocked',
  'endowments.eligibility.reasonsTitle',
  'endowments.eligibility.unknownReason',
  'endowments.classification.historyTitle',
  'endowments.classification.obligationsTitle',
  'endowments.classification.excludedTitle',
  'endowments.shart.immutableTitle',
  'endowments.shart.immutableBody',
  'endowments.shart.supersedingTitle',
  'endowments.shart.supersedingBody',
  'endowments.shart.unspecified',
  'endowments.shart.unspecifiedNote',
  'endowments.shart.missingTitle',
  'endowments.shart.advisoryTitle',
  'endowments.shart.wouldHaltTitle',
  'endowments.reserved.blockedBadge',
  'endowments.reserved.blockedBody',
  'endowments.reserved.istibdalCorpusNote',
  /**
   * ── S7 · the distribution run ────────────────────────────────────────────────────────
   * Only the load-bearing sentences are pinned, not the whole namespace. Each of these is a
   * sentence a screen must not be able to lose silently:
   *
   *  · the CORPUS WALL pair. `waterfall.corpusTitle` + `corpusBody` are how a screen states, in
   *    the reader's own language, that sale and istibdal proceeds are asl and enter no figure in
   *    the waterfall; `corpusNoTotal` is the one that forbids the combined total. Binding rule 1
   *    is a database CHECK, an engine invariant (I-C1) and a UI sentence — this is the sentence.
   *  · `flag.CAPITAL_RECEIPTS_EXCLUDED` and `flag.MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED` —
   *    the two run flags S7 requires VISIBLE. The second one's whole point is that the zero
   *    reserve is not a decision anybody made (the owner's OQ-06 discretion is not a default).
   *  · `lines.noCopyTitle` + `noCopyBody` — the sentence that accompanies a machine code with no
   *    approved wording. Deleting it would leave a bare Latin code on an Arabic-first screen with
   *    nothing saying why, which is the V-E3-M4 defect.
   *  · `approval.body` — maker ≠ checker, stated to the reader (§10 §4.2, BR-506, gate G-3).
   */
  'distribution.waterfall.corpusTitle',
  'distribution.waterfall.corpusBody',
  'distribution.waterfall.corpusNoTotal',
  'distribution.waterfall.nazirFeeDeedNote',
  'distribution.flag.CAPITAL_RECEIPTS_EXCLUDED',
  'distribution.flag.MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED',
  'distribution.flag.UNVERIFIED_FIGURES_APPLIED',
  'distribution.lines.noCopyTitle',
  'distribution.lines.noCopyBody',
  'distribution.lines.gateBody',
  'distribution.approval.body',
  'distribution.refusal.discriminatorTitle',
  'distribution.invariant.I-C1',
  'distribution.invariant.I-R1',
] as const;

describe('catalogue structure', () => {
  it('ships exactly one catalogue per supported locale', () => {
    expect(locales).toEqual(['ar', 'en']);
    expect(Object.keys(messages).sort()).toEqual(['ar', 'en']);
  });

  it('declares the same namespaces, in the same order, in both locales', () => {
    expect(Object.keys(ar)).toEqual([...EXPECTED_NAMESPACES]);
    expect(Object.keys(en)).toEqual([...EXPECTED_NAMESPACES]);
  });

  it('keeps the on-disk files and the package exports identical', () => {
    // Guards the case where someone edits a catalogue but a stale build artefact, a
    // duplicated copy, or a hand-written override is what actually ships.
    expect(getMessages('ar')).toEqual(ar);
    expect(getMessages('en')).toEqual(en);
    expect(getNamespace('ar', 'nav')).toEqual(ar.nav);
  });

  it('exposes every sidebar destination the AppShell renders', () => {
    for (const item of SIDEBAR_ITEMS) {
      expect(arKeys).toContain(`nav.${item}`);
    }
  });
});

describe('ar.json and en.json have identical key sets, recursively', () => {
  it('has the same number of leaves', () => {
    expect(arLeaves).toHaveLength(enLeaves.length);
  });

  it('has no key present in en.json but missing from ar.json', () => {
    // This is the dangerous direction. Arabic is the DEFAULT locale and the statutory
    // language of the financial record — a missing Arabic string is the one a real user
    // sees first, rendered as a raw dotted key.
    const missingFromArabic = enKeys.filter((key) => !arKeys.includes(key));

    expect(missingFromArabic).toEqual([]);
  });

  it('has no key present in ar.json but missing from en.json', () => {
    const missingFromEnglish = arKeys.filter((key) => !enKeys.includes(key));

    expect(missingFromEnglish).toEqual([]);
  });

  it('lists the keys in the same order in both files', () => {
    // Not cosmetic: matching order keeps translation diffs reviewable by someone who does
    // not read both scripts, and makes a dropped key visible as a one-line diff.
    expect(arKeys).toEqual(enKeys);
  });

  it('nests to the same depth — a key may not become a namespace in one locale only', () => {
    const shape = (catalogue: Catalogue, prefix = ''): string[] =>
      Object.entries(catalogue).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return value !== null && typeof value === 'object'
          ? [`${path}:object`, ...shape(value, path)]
          : [`${path}:string`];
      });

    expect(shape(ar)).toEqual(shape(en));
  });

  it('retains every key named in the E0 build contract', () => {
    const absent = CONTRACT_KEYS.filter((key) => !arKeys.includes(key));

    expect(absent).toEqual([]);
  });
});

describe('value hygiene', () => {
  it.each(locales)('has no empty or whitespace-only value in %s.json', (locale: Locale) => {
    const leaves = locale === 'ar' ? arLeaves : enLeaves;
    const empty = leaves.filter(([, value]) => String(value).trim() === '').map(([key]) => key);

    expect(empty).toEqual([]);
  });

  it.each(locales)('has only string leaves in %s.json — no null, number or array', (locale) => {
    const leaves = locale === 'ar' ? arLeaves : enLeaves;
    const nonStrings = leaves.filter(([, value]) => typeof value !== 'string').map(([key]) => key);

    expect(nonStrings).toEqual([]);
  });

  it('leaves no untranslated placeholder marker in either catalogue', () => {
    const markers = /\b(TODO|FIXME|TRANSLATE|UNTRANSLATED|XXX|LOREM)\b/i;
    const offenders = [...arLeaves, ...enLeaves]
      .filter(([, value]) => markers.test(value))
      .map(([key]) => key);

    expect(offenders).toEqual([]);
  });
});

/**
 * ── The Latin-script heuristic, and its honest limits ─────────────────────────────────
 *
 * WHAT IT CATCHES: the overwhelmingly common regression — a key is added to `en.json` and
 * copy-pasted verbatim into `ar.json` as a placeholder "to translate later", which then
 * ships. Every such value is pure Latin script and trips both checks below.
 *
 * WHAT IT CANNOT CATCH, and nobody should believe otherwise:
 *   · a MISTRANSLATION. Arabic characters are all this proves; correctness is a human
 *     review, and for financial and legal copy that review is not optional.
 *   · a transliteration ("waqf" written as وقف is fine; "Waqf" written in Arabic letters
 *     but as a borrowed English phrase is not detected).
 *   · a value that is mostly Arabic with an untranslated English clause appended, if that
 *     clause is under three Latin characters.
 *   · anything about tone, register, or whether the Arabic is the AUTHORITATIVE wording
 *     required for a statutory record.
 *
 * THE ALLOW-LIST is deliberately tiny and exact-match only. A prefix or substring match
 * would let "QMULATE Dashboard" through. If a fourth entry is ever needed, that is a
 * conversation about brand vocabulary, not a quick edit.
 */
const LATIN_ALLOWED_IN_ARABIC: Readonly<Record<string, string>> = {
  // The brand mark is a wordmark. It is never transliterated — DESIGN.md §3.
  'common.appName': 'Cumulate App',
  // The language switcher writes each language in its OWN script, so the reader can find
  // their language without already being able to read the other one.
  'common.languageEn': 'English',
  // ISO 4217. SAR renders in Latin letters and Latin digits in both locales (Saudi banking
  // convention), which is also what keeps tabular figure columns aligned.
  'common.currencyCode': 'SAR',
};

describe('ar.json is actually in Arabic (heuristic — read the block comment above)', () => {
  /**
   * A Unicode script property, not a hand-rolled code-point range. Hand-rolled ranges have
   * to be written as literal characters (unreviewable in a diff — some of them, U+FEFF
   * among them, are invisible) or as escapes that are easy to get subtly wrong. This
   * covers Arabic, the Arabic Supplement, and both presentation-form blocks exactly.
   */
  const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
  /** Three or more consecutive Latin letters — a word, not an initialism inside prose. */
  const LATIN_WORD = /[A-Za-z]{3,}/;
  /**
   * ICU MessageFormat argument names (`{count}`, `{date, date, medium}`, …) are wire
   * vocabulary, not translatable prose — `count` is a variable name, not English left
   * behind. Strip every `{...}` span before running LATIN_WORD so a placeholder's argument
   * name can never trip the heuristic, in either direction: this does not allow-list the
   * word "count", it removes the placeholder from consideration entirely, so a genuinely
   * untranslated Latin word sitting OUTSIDE a placeholder in the same value still fails.
   */
  const stripIcuPlaceholders = (value: string) => value.replace(/\{[^}]*\}/g, '');

  it('contains at least one Arabic character in every value outside the allow-list', () => {
    const offenders = arLeaves
      .filter(([key, value]) => !(key in LATIN_ALLOWED_IN_ARABIC) && !ARABIC_SCRIPT.test(value))
      .map(([key, value]) => `${key} = ${JSON.stringify(value)}`);

    expect(offenders).toEqual([]);
  });

  it('contains no Latin word left over from en.json outside the allow-list', () => {
    const offenders = arLeaves
      .filter(
        ([key, value]) =>
          !(key in LATIN_ALLOWED_IN_ARABIC) && LATIN_WORD.test(stripIcuPlaceholders(value)),
      )
      .map(([key, value]) => `${key} = ${JSON.stringify(value)}`);

    expect(offenders).toEqual([]);
  });

  it('pins the allow-list to the exact values that justify it', () => {
    // If `common.appName` is ever changed to "Qmulate Platform", the exemption must be
    // re-argued rather than silently widened.
    for (const [key, expected] of Object.entries(LATIN_ALLOWED_IN_ARABIC)) {
      const leaf = arLeaves.find(([leafKey]) => leafKey === key);
      expect(leaf, `allow-listed key ${key} is missing from ar.json`).toBeDefined();
      expect(leaf?.[1]).toBe(expected);
    }
  });

  it('keeps the allow-list small enough to audit by eye', () => {
    // A growing allow-list means the heuristic is being worked around instead of the copy
    // being translated. Three entries, all brand or ISO vocabulary.
    expect(Object.keys(LATIN_ALLOWED_IN_ARABIC)).toHaveLength(3);
  });

  it('would catch a copy-pasted English value (self-test of the heuristic)', () => {
    // A test whose assertion is "nothing found" is worthless if the detector is broken.
    const pretendCatalogue: Catalogue = { auth: { resendCode: 'Resend code' } };
    const leaked = flatten(pretendCatalogue).filter(([, value]) => !ARABIC_SCRIPT.test(value));

    expect(leaked).toEqual([['auth.resendCode', 'Resend code']]);
  });

  it('does not flag an ICU placeholder argument name as leftover English', () => {
    // The regression this stage fixed: `{count}` inside "{count} متأخر" is wire vocabulary,
    // not prose, and must not trip the same check that catches a copy-pasted English value.
    expect(LATIN_WORD.test(stripIcuPlaceholders('{count} متأخر'))).toBe(false);
  });

  it('still catches a genuine leftover English word sitting beside a placeholder', () => {
    // Stripping the placeholder must not blind the check to Latin text OUTSIDE it — proves
    // the fix removes only the placeholder span, not the whole value.
    expect(LATIN_WORD.test(stripIcuPlaceholders('{count} remaining متأخر'))).toBe(true);
  });
});

describe('en.json', () => {
  it('keeps the Arabic language name in Arabic script', () => {
    // Same rule as `common.languageEn` in ar.json, mirrored: a language is always offered
    // in its own script.
    expect(en.common).toMatchObject({ languageAr: 'العربية' });
  });

  it('leaves the brand mark untranslated', () => {
    expect(en.common).toMatchObject({ appName: 'Cumulate App' });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * THE ERROR CATALOGUE — key-for-key parity with the CODE LISTS, in both directions
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * `DomainError` sets `messageKey = 'errors.domain.' + code` and `ApiError` sets
 * `messageKey = 'errors.access.' + code`. Both files say, in their own headers, that adding a
 * code is "a contract change: the i18n catalogue must gain the matching key in BOTH locales".
 * Nothing enforced that until this block.
 *
 * ── WHY THE STATIC SCAN CANNOT DO THIS JOB ────────────────────────────────────────────────
 * `scripts/check-i18n-keys.ts` walks `apps/web/src` looking for literal `t('a.b')` calls. An
 * error message is resolved as `t(error.messageKey)` — a value built at runtime — so the scan
 * reports it as "cannot be checked statically" and moves on. That is the exact gap a missing
 * Arabic string falls through: next-intl does not throw for a missing message, it PRINTS THE
 * KEY, so a caller in the default (Arabic) locale sees `errors.access.NO_GRANT` on screen and
 * CI stays green. Arabic is authoritative (NFR-01), not a fallback.
 *
 * ── WHY THE LISTS ARE READ AS TEXT, NOT IMPORTED ──────────────────────────────────────────
 * Two reasons, and the first is decisive:
 *   1. `@qmulate/api` DEPENDS ON `@qmulate/i18n`. Importing it back here would make the
 *      workspace graph circular — §17 fixes the direction as `apps → api → {…, i18n} → config`.
 *   2. Reading the declaration as text is the discipline already established by
 *      `packages/auth/test/roles.test.ts`, which parses `enum Role` out of `schema.prisma`. The
 *      artefact under review is the source file a developer edits, and a text read cannot be
 *      satisfied by a stale build artefact or a re-declared local copy.
 * Neither side is hand-copied: the catalogue tests the code lists and the code lists test the
 * catalogue. Adding `WHATEVER_NEW_CODE` to either array fails this suite until both locales
 * carry a message; deleting a message fails it too.
 */

/** `packages/i18n/test/` → the repo root. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Where each code list is DECLARED. A moved file must fail loudly, not silently pass. */
const CODE_LIST_SOURCES = {
  domain: {
    path: `${REPO_ROOT}packages/domain/src/errors.ts`,
    constName: 'DOMAIN_ERROR_CODES',
    /** `DomainError.messageKey` — see packages/domain/src/errors.ts. */
    namespace: 'errors.domain',
    /**
     * A floor, not the count. A hardcoded count would be a hand-copied fact that has to be
     * edited every time a code is added — which is how a list stops being read. This exists
     * only so that a PARSER that matches nothing fails instead of asserting over an empty set.
     * 17 codes shipped in Sprint 1; E2 adds the authorization, setting and calendar groups.
     */
    floor: 17,
  },
  access: {
    path: `${REPO_ROOT}packages/api/src/errors.ts`,
    constName: 'API_ERROR_CODES',
    /** `ApiError.messageKey` — see packages/api/src/errors.ts. */
    namespace: 'errors.access',
    floor: 10,
  },
} as const;

type CodeListName = keyof typeof CODE_LIST_SOURCES;

/**
 * Extracts a `export const NAME = [ 'A', 'B' ] as const;` array of SCREAMING_SNAKE literals.
 *
 * Comments are stripped BEFORE the literals are matched, because both source files document
 * every code in a doc comment above it and those comments quote code in backticks and prose in
 * double quotes. The literal pattern is deliberately narrow — an upper-case identifier only —
 * so a stray quoted word in a comment could not be mistaken for a code even if one survived.
 */
function parseCodeList(source: string, constName: string): string[] {
  const declaration = `export const ${constName} = [`;
  const start = source.indexOf(declaration);
  if (start === -1) {
    throw new Error(
      `could not find "${declaration}" — the declaration was renamed or reformatted. ` +
        `Fix this parser rather than deleting the assertion: it is the only thing keeping the ` +
        `ar/en error catalogue in step with the code list.`,
    );
  }
  const end = source.indexOf('] as const;', start);
  if (end === -1) {
    throw new Error(`found "${declaration}" but no closing "] as const;" after it`);
  }

  const body = source
    .slice(start + declaration.length, end)
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/\/\/[^\n]*/g, '');

  return [...body.matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map((match) => match[1] as string);
}

const codeLists = Object.fromEntries(
  (Object.keys(CODE_LIST_SOURCES) as CodeListName[]).map((name) => {
    const spec = CODE_LIST_SOURCES[name];
    return [name, parseCodeList(readFileSync(spec.path, 'utf8'), spec.constName)];
  }),
) as Record<CodeListName, string[]>;

/** The catalogue keys currently living under `errors.<domain|access>.`, per locale. */
function cataloguedCodes(catalogue: Catalogue, namespace: string): string[] {
  const prefix = `${namespace}.`;
  return flatten(catalogue)
    .map(([key]) => key)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

describe('the parser that reads the code lists (self-test — an assertion over an empty set is worthless)', () => {
  it('extracts the codes and ignores everything in the doc comments', () => {
    const pretend = [
      '/** A block comment naming a fake code: FAKE_CODE and a quoted one: ',
      " * 'NOT_A_CODE' — plus a wildcard `approval:*`. */",
      'export const PRETEND_CODES = [',
      '  /** doc */',
      "  'REAL_ONE',",
      "  // a line comment mentioning 'ALSO_NOT_A_CODE'",
      "  'REAL_TWO',",
      '] as const;',
      "export const OTHER = ['DECOY'] as const;",
    ].join('\n');

    expect(parseCodeList(pretend, 'PRETEND_CODES')).toEqual(['REAL_ONE', 'REAL_TWO']);
  });

  it('throws rather than returning [] when the declaration is gone', () => {
    expect(() =>
      parseCodeList('export const SOMETHING_ELSE = [] as const;', 'PRETEND_CODES'),
    ).toThrow(/could not find/);
  });

  it.each(Object.keys(CODE_LIST_SOURCES) as CodeListName[])(
    'read a plausible %s code list off disk',
    (name) => {
      const codes = codeLists[name];
      expect(
        codes.length,
        `parsed only ${codes.length} code(s) from ${CODE_LIST_SOURCES[name].path} — the parser is ` +
          `probably broken, which would make every parity assertion below vacuous`,
      ).toBeGreaterThanOrEqual(CODE_LIST_SOURCES[name].floor);
      expect(codes.every((code) => /^[A-Z][A-Z0-9_]*$/.test(code))).toBe(true);
      expect(new Set(codes).size, `duplicate code(s) in ${name}`).toBe(codes.length);
    },
  );
});

describe.each(Object.keys(CODE_LIST_SOURCES) as CodeListName[])(
  'errors.%s.* is key-for-key identical to its code list',
  (name) => {
    const { namespace } = CODE_LIST_SOURCES[name];
    const codes = codeLists[name];

    it.each(locales)(`has a ${namespace}.<CODE> message for every code in %s.json`, (locale) => {
      const present = new Set(cataloguedCodes(locale === 'ar' ? ar : en, namespace));
      const untranslated = codes.filter((code) => !present.has(code));

      // A code with no message is the dangerous direction: the raw key renders on screen.
      expect(untranslated, `codes with no ${locale} message under ${namespace}`).toEqual([]);
    });

    it.each(locales)(`has no orphan ${namespace}.* key in %s.json`, (locale) => {
      const known = new Set(codes);
      const orphans = cataloguedCodes(locale === 'ar' ? ar : en, namespace).filter(
        (code) => !known.has(code),
      );

      // The other direction. An orphan message means a code was RENAMED or DELETED and the copy
      // was left behind — dead weight a translator keeps maintaining, and a hint that the real
      // code's message may never have been written.
      expect(orphans, `${locale} messages under ${namespace} with no matching code`).toEqual([]);
    });

    it('carries the same set of codes in ar and en', () => {
      // Redundant with the two assertions above only while both pass. Stated separately so a
      // failure says "the two locales disagree" rather than "Arabic is missing four codes".
      expect(cataloguedCodes(ar, namespace).sort()).toEqual(cataloguedCodes(en, namespace).sort());
    });
  },
);

/**
 * ── THE NON-DISCLOSURE CODES SHARE ONE WORDING, DELIBERATELY ──────────────────────────────
 *
 * `NO_GRANT`, `SCOPE_REF_MISMATCH` and `AML_COMPARTMENT_ONLY` all map to tRPC `NOT_FOUND` in
 * `packages/api/src/errors.ts` for one reason: the caller must not learn that the thing exists.
 * §10 §7.2 — "not FORBIDDEN — do not disclose the endowment exists"; §6 — the AML compartment is
 * an *empty set*, "as if it does not exist".
 *
 * A distinguishable MESSAGE defeats that at the last step. "You are not a member of the
 * compartment" is a tipping-off disclosure written in the copy deck rather than the code, and no
 * status-code test would catch it. So the three messages must be byte-identical in both locales.
 */
const NON_DISCLOSURE_CODES = ['NO_GRANT', 'SCOPE_REF_MISMATCH', 'AML_COMPARTMENT_ONLY'] as const;

describe('the three non-disclosure refusals are indistinguishable to the caller', () => {
  it.each(locales)('is one identical wording across all three codes in %s.json', (locale) => {
    const leaves = new Map(locale === 'ar' ? arLeaves : enLeaves);
    const wordings = NON_DISCLOSURE_CODES.map((code) => leaves.get(`errors.access.${code}`));

    expect(wordings.every((value) => typeof value === 'string' && value.length > 0)).toBe(true);
    expect(new Set(wordings).size, `wordings: ${JSON.stringify(wordings)}`).toBe(1);
  });

  it('names only codes that really are NOT_FOUND in the API status table', () => {
    // The pairing is the point: if a code is ever remapped away from NOT_FOUND, sharing its copy
    // with the other two stops being correct. Read from the source rather than restated.
    const source = readFileSync(CODE_LIST_SOURCES.access.path, 'utf8');
    for (const code of NON_DISCLOSURE_CODES) {
      expect(source, `${code} is no longer mapped to NOT_FOUND`).toMatch(
        new RegExp(`${code}:\\s*'NOT_FOUND'`),
      );
    }
  });

  it('names ALL of them — the list cannot silently fall behind the status table', () => {
    // ⊕ ADDED IN S8, and it closes the direction the assertion above cannot see. That one proves
    // every NAMED code is NOT_FOUND; nothing proved every NOT_FOUND code is NAMED. So a new
    // non-disclosure refusal could ship with its own distinguishable sentence and this block would
    // stay green while asserting confidently about three of four codes.
    //
    // `packages/api` now DERIVES the class from its own status table (`NON_DISCLOSURE_CODES` in
    // errors.ts §3b), so the truth is mechanical there. This file cannot import it — it reads
    // `packages/api` as TEXT precisely to avoid the cycle — so it re-derives from the same text and
    // compares. Two sides that must agree, which is S1's lesson and the reason this test exists.
    const source = readFileSync(CODE_LIST_SOURCES.access.path, 'utf8');
    const derived = [...source.matchAll(/^\s{2}([A-Z_]+):\s*'NOT_FOUND',/gm)].map((m) => m[1]);

    // Trustworthiness guard: a parser that matches nothing must fail, not assert over an empty set.
    expect(
      derived.length,
      'the NOT_FOUND rows could not be parsed out of the status table',
    ).toBeGreaterThanOrEqual(3);
    expect([...derived].sort()).toEqual([...NON_DISCLOSURE_CODES].sort());
  });

  it('the class collapses onto ONE key at the source, so two catalogue entries are unreferenced', () => {
    // ⚠ RECORDED so the next reader does not "tidy" them away. Since S8, `ApiError`'s constructor
    // narrows `messageKey` to the CLASS's key for every member — closing the SSR channel where
    // `apps/web` reads `messageKey` off `error.cause` and tRPC's `errorFormatter` never runs. The
    // consequence is that `errors.access.AML_COMPARTMENT_ONLY` and `errors.access.SCOPE_REF_MISMATCH`
    // are no longer looked up by anything at RUNTIME.
    //
    // They must still EXIST: the block above requires a catalogue entry for every code in
    // `API_ERROR_CODES`, and a partially-populated group is the failure mode this file exists to
    // catch. They are also the record of what the class is made of. Deleting them because "nothing
    // references them" would turn a reverted narrowing into a screen full of raw dotted keys — which
    // next-intl PRINTS rather than throwing on.
    const source = readFileSync(CODE_LIST_SOURCES.access.path, 'utf8');
    expect(source, 'the constructor no longer narrows messageKey for the class').toMatch(
      /isNonDisclosureCode\(code\)\s*\?\s*NON_DISCLOSURE_WIRE_CODE/,
    );
    for (const locale of locales) {
      const leaves = new Map(locale === 'ar' ? arLeaves : enLeaves);
      for (const code of NON_DISCLOSURE_CODES) {
        expect(leaves.get(`errors.access.${code}`), `${code} lost its entry in ${locale}`).toEqual(
          expect.any(String),
        );
      }
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * S4/E3 · THE GROUPS THAT ARE LOOKED UP BY MACHINE CODE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * `scripts/check-i18n-keys.ts` only understands a literal `t('a.b')`. The endowment screens
 * render a domain enum by looking its VALUE up in a group — `endowments.classificationValue`
 * keyed by `MEDIUM`, `endowments.reserved.kind` keyed by `ASSET_SUBSTITUTION_ISTIBDAL`, and so
 * on — so the static scan reports those references as unresolvable and moves on. That is the
 * same blind spot the error-catalogue block above exists to close, and it fails the same way:
 * next-intl does not throw for a missing message, it PRINTS THE KEY, so a `JOINT` endowment
 * would render `endowments.waqfTypeValue.JOINT` on a Nazir's screen and CI would stay green.
 *
 * Each group's members are written down HERE, once, and both catalogues are checked against
 * them in both directions. A group is exhaustive by design: an enum gaining a member is a
 * schema change, and it should redden this file until a translator has been given the term.
 *
 * ⚠ A HAND-MAINTAINED LIST CANNOT SEE A CODE NOBODY ADDED TO IT — which is precisely how
 * V-E3-M5 happened (two emitted eligibility refusal codes, zero copy, this suite green). The
 * SECOND guard is `test/code-source-parity.test.ts`: it derives every group below from the file
 * that DECLARES it (`schema.prisma`'s enums, the domain's contract, the api's own emission
 * sites) and parses the api's reason codes out of the router. Keep both. This list is the one a
 * reader can audit by eye; that one is the one a new code cannot slip past.
 *
 * ⚠ `waqfTypeValue.JOINT` IS DELIBERATELY PRESENT. The distribution engine REFUSES the value
 * (`WAQF_TYPE_JOINT_NOT_SUPPORTED`) but `WaqfType` still carries it in `schema.prisma`, in
 * `WAQF_TYPES` and in fixture `waqf-003` — it is a vocabulary the engine refuses, not one that
 * was narrowed. ⊕ And since 2026-08-25 the refusal is SCOPE rather than doctrine: the owner
 * reversed register item #11 (*"a joint waqf is described as partially ذري and partially خيري"*),
 * so a joint endowment is a legitimate record this engine simply cannot yet COMPUTE. A refused
 * value still has to render as words — and now more so, because the thing it names is real.
 *
 * ⚠ WHAT IS NOT HERE, ON PURPOSE — and S7 did NOT change this. The distribution
 * EXCLUSION-REASON codes (8), the ENTITLEMENT-RULE codes (7), the computationTrace codes and the
 * twenty-six `SHART_REFUSALS` discriminators are product-approved legal text a beneficiary may
 * dispute before the Authority, they are owned by E10/E12, and none of them may be invented in a
 * code change. The screens render them as machine codes beside the one catalogued sentence
 * (`errors.domain.SHART_INCOMPLETE`), so adding a per-discriminator key here would be the wrong
 * fix in the wrong file. The eight exclusion codes and seven entitlement rules are instead
 * enumerated on the OWED REGISTER in `code-source-parity.test.ts`, which fails if one of them
 * ever gains half-written copy or stops being emitted.
 *
 * ⊕ S7 · `distribution.*` DID add groups here, and the line between them and the paragraph above
 * is where the code is READ, not what package declares it. These are INTERNAL OPERATIONS
 * vocabulary — a run's lifecycle state, a line's payment state, the flags and invariants on the
 * maker/checker panel, the mapping's own observations. Engineering may write those labels
 * (flagged as engineering's rendering, owed to the E10/E12 copy review, same standing as
 * `assetStatusValue` and `RECEIPT_CLASS_CORRECTION`). ⚠ The moment one of them lands on a
 * BENEFICIARY STATEMENT it is a different artifact and goes through the owed register instead.
 *
 * ⚠ AND ONE GROUP IS DELIBERATELY ABSENT THOUGH THE ENGINE DECLARES IT: `BENEFICIARY_LINES`
 * (`ZUHUR` | `BUTUN` | `NA`), carried on every line as `basis.line`. It is the ẓuhūr/buṭūn
 * DESCENT FACT — the same fact as `LineageLink`, one derivation removed — and this file already
 * records that a group for `LineageLink` "appearing here is itself a defect" (ADR-0009). A label
 * reading «بطون» beside a person's name renders that they descend through a daughter, which is
 * the exact disclosure the rule exists to prevent. No label, no key, no group.
 */
const CODE_KEYED_GROUPS: Readonly<Record<string, readonly string[]>> = {
  // WaqfClassification — the Authority's four bands.
  // ⊕ S8-Q4 (owner, 2026-08-23): `NOT_CLASSIFIED` — the onboarding state's LABEL, staff-screen
  // register like its four siblings. The A2 "set classification first" PROMPT is separate
  // product-approved copy still owed (E10/E12); this label must not be mistaken for it.
  // ⊕ S9-4a (owner ruling, fifth batch, 2026-08-25): `DIRECT_UTILIZATION` REMOVED. It is not a size —
  // it is an orthogonal usage attribute (`Waqf.directUtilization`) — so the enum narrowed and its
  // label went with it. Its approved wording was "Direct-benefit" / "ذات انتفاع مباشر".
  // ⚠ The NEW attribute's own yes/no label pair is OWED and deliberately NOT invented in a backend
  // change (the M1-a partition: statement copy is product-approved, not engineering's). No screen
  // renders it yet; whichever stage first does should REUSE the wording above for the `true` case
  // rather than composing new Arabic for a concept that already has approved words.
  'endowments.classificationValue': ['LARGE', 'MEDIUM', 'SMALL', 'NOT_CLASSIFIED'],
  // ⊕ 2026-08-24 (Milestone 1) · the TIER-1 statement groups, hand-listing exactly the APPROVED
  // subsets from docs/product/statement-copy/APPROVED-WORDING.md. The unwired remainder of each
  // vocabulary is on code-source-parity's owed register — deliberately partial here, and the
  // partition subset ⊎ owed = contract is asserted there.
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
  // WaqfType — three, JOINT included; see the note above.
  'endowments.waqfTypeValue': ['PUBLIC_CHARITABLE', 'FAMILY_DHURRI', 'JOINT'],
  'endowments.waqfNatureValue': ['AYNI', 'QIYAMI'],
  // EntitlementOrder — four as of migration 12, which added LINEAGE_CONTINUATION.
  'endowments.entitlementOrderValue': [
    'ORDERED',
    'SHARED',
    'LINEAGE_CONTINUATION',
    'NA_DIRECT_USE',
  ],
  // ContinuationStipulation — a CLOSED two-value deed term. There is no third member: absent
  // is the absence of a value, not a value, and it renders as `common.notRecorded`.
  'endowments.continuationValue': ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'],
  'endowments.reversionKindValue': ['CHARITABLE_ULTIMATE_TAKER'],
  // ⊕ S11-1 — RegistrationAnchorKind, the owner's dropdown for the REGISTER_30BD clock-start
  // (9f3d8fd). A CLOSED two-value term with no default; staff-facing labels, Arabic engineering's.
  'endowments.registrationAnchorKindValue': [
    'WAQF_DOCUMENTATION_DATE',
    'REGULATION_EFFECTIVE_DATE',
  ],
  // ⊕ S11-2 — DeadlineDischargeKind (migration 49): one member, pinned; a widening must add copy here too.
  'endowments.dischargeKindValue': ['MET'],
  /**
   * `AssetStatus` — the CLOSED corpus-asset vocabulary the product owner set on 2026-08-16
   * (decisions log D-A), replacing a free-text column that let an Arabic spelling walk past
   * BR-306's disposal gate (V-E3-02).
   *
   * ⚠ THESE ARE ORDINARY UI LABELS AND THE ARABIC IS ENGINEERING'S, AWAITING CONFIRMATION. An
   * asset's occupancy is not a statement a beneficiary disputes before the Authority, so the
   * E10/E12 prohibition does not reach it — but the owner prefixed his list "I'm thinking", so the
   * renderings of `EXPROPRIATED` (نزع الملكية) and `SUBSTITUTED_ISTIBDAL` (استبدال) in particular
   * are flagged for him: both name reserved matters, and both use the domain's own vocabulary.
   */
  'endowments.assetStatusValue': [
    'ACTIVE',
    'FULLY_RENTED',
    'PARTIALLY_RENTED',
    'VACANT',
    'EXPROPRIATED',
    'SUBSTITUTED_ISTIBDAL',
  ],
  /**
   * S5/E4 — the beneficiary registry's four vocabularies (BR-201…BR-206). Ordinary UI labels.
   * ⚠ `kycValue` is COMPUTED state (FRESH/STALE/UNVERIFIED from `kycLastRefreshed` + the
   * ⚠-unverified Setting interval), not a stored enum — STALE and UNVERIFIED are the engine's own
   * distinct conditions (gates.ts) and must never be collapsed into one label. And there is
   * DELIBERATELY no group for `LineageLink` (SON/DAUGHTER): it is the ẓuhūr/buṭūn eligibility
   * fact, never rendered — a group for it appearing here is itself a defect.
   */
  'endowments.beneficiaries.kindValue': ['FAMILY', 'CHARITABLE_JIHA', 'CATEGORY_ONLY'],
  'endowments.beneficiaries.verificationValue': ['VERIFIED', 'PENDING', 'UNVERIFIED'],
  'endowments.beneficiaries.residencyValue': ['DOMESTIC', 'CROSS_BORDER'],
  'endowments.beneficiaries.kycValue': ['FRESH', 'STALE', 'UNVERIFIED'],
  // ⊕ S8-Q3 (owner, 2026-08-23) — six gates. ⚠ The ar/en labels for EXCLUDE_DIRECT and HAS_INCOME are
  // ENGINEERING'S RENDERING of ordinary regulatory vocabulary, not product-approved legal copy — the
  // same standing as AssetStatus's six and RECEIPT_CLASS_CORRECTION's, and owed to the same E10/E12
  // review path. They ship WITH Arabic rather than without: a missing key renders as a raw dotted key
  // on an Arabic-first screen, which is worse than a flagged rendering. `LARGE_ONLY` keeps its label
  // because it is retired, not deleted, and an old record must still render.
  'endowments.classification.gate': [
    'ALL',
    'LARGE_MEDIUM',
    'SMALL_DIRECT',
    'EXCLUDE_DIRECT',
    'HAS_INCOME',
    'LARGE_ONLY',
  ],
  'endowments.classification.section': ['FINANCIAL', 'OPERATIONAL', 'GOVERNMENT_LEGAL'],
  'endowments.reserved.status': ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'VOID'],
  'endowments.reserved.kind': [
    'ASSET_DISPOSAL',
    'ASSET_SUBSTITUTION_ISTIBDAL',
    'ASSET_PLEDGE',
    'ASSET_LONG_LEASE',
    'DEED_IDENTITY',
    'DEED_TERM_RECORD',
    'ACCESS_MATRIX_CHANGE',
    // ⊕ S6/E5 (owner ruling Q-E5-1(b), 2026-08-18): correcting a receipt's income-vs-capital
    // classification is a reserved matter. ⚠ Its ar/en is ENGINEERING'S RENDERING of staff-facing
    // vocabulary, owed to the E10/E12 copy review — see the note on this group in
    // `code-source-parity.test.ts`, which is the guard that caught the omission.
    'RECEIPT_CLASS_CORRECTION',
    // ⊕ S10-2a (owner ruling 2026-08-25, S8 fourth batch): the reserved-matter gate on the
    // migration-34 return door. ⚠ Same standing as its sibling above — ENGINEERING'S RENDERING of
    // staff-facing governance vocabulary, owed to the E10/E12 copy review, deliberately NOT on the
    // owed-copy register (see `code-source-parity.test.ts`'s note on this group, which states why
    // parking a staff label there would hollow out a register meant for sentences a beneficiary
    // reads).
    'CLASSIFICATION_RETURN_TO_NOT_CLASSIFIED',
  ],
  'endowments.reserved.chainState': ['RECORDED', 'NOT_RECORDED', 'NOT_REQUIRED'],
  /**
   * `ELIGIBILITY_CRITERIA` from `@qmulate/domain/eligibility` — SCREAMING_SNAKE, not the deed's
   * camelCase column names. Six, and not the seven BR-109 lists: "qualifications" and "good
   * conduct" have no column on `TrusteeshipDeed`, and a criterion the resolver could only ever
   * report as `null` would make every deed permanently unseatable.
   */
  'endowments.eligibility.criteria': [
    'ISLAM',
    'LEGAL_CAPACITY',
    'NO_DISQUALIFYING_REMOVAL',
    'KSA_RESIDENCY',
    'SAUDI_NATIONALITY_WHERE_REQUIRED',
    'AUTHORITY_LICENSED',
  ],
  /**
   * `CRITERION_APPLICABILITIES`. `UNDECIDED_SURFACED` is the honest third value: whether a
   * criterion binds an authorized REPRESENTATIVE is a live legal question, so it is reported,
   * never blocks, and is never a pass. It needs its own words for exactly that reason —
   * borrowing `NOT_APPLICABLE`'s copy would be the UI answering counsel's question.
   */
  'endowments.eligibility.applicability': ['REQUIRED', 'NOT_APPLICABLE', 'UNDECIDED_SURFACED'],
  /**
   * `ELIGIBILITY_REASON_CODES` from `@qmulate/domain/eligibility`, plus the api's own Art. 11(5)
   * refusal `REP_JOINT_LIABILITY_REQUIRED`.
   *
   * These are ORDINARY E3 VALIDATION MESSAGES, not distribution reason codes — the E10/E12
   * prohibition does not reach them, and BR-109's exit clause ("blocked with a clear reason") is
   * only met if they read as sentences in both languages rather than as codes.
   *
   * ⚠ Note the polarity of `DISQUALIFYING_REMOVAL_RECORDED`: the flag is positive
   * (`noDisqualifyingRemoval: true` = clean), so the REFUSAL names the removal, not the flag. A
   * message written against the flag's name would say the opposite of what happened.
   *
   * ⚠ There is deliberately ONE code for all unassessed criteria rather than six: "nobody has
   * checked this yet" is a single operational condition with a single remedy. WHICH criterion was
   * not assessed is data (`EligibilityVerdict.notAssessed`), rendered from
   * `endowments.eligibility.criteria` — the same reasoning that keeps twenty-six `SHART_REFUSALS`
   * discriminators under one `SHART_INCOMPLETE`.
   */
  'endowments.eligibility.reasons': [
    'ISLAM_REQUIRED',
    'LEGAL_CAPACITY_REQUIRED',
    'DISQUALIFYING_REMOVAL_RECORDED',
    'KSA_RESIDENCY_REQUIRED',
    'SAUDI_NATIONALITY_REQUIRED',
    'AUTHORITY_LICENCE_REQUIRED',
    'ELIGIBILITY_NOT_ASSESSED',
    'REP_JOINT_LIABILITY_REQUIRED',
    // ⊕ 2026-08-24 (Milestone 1): the V-E3-M5 pair's approved wording arrived (APPROVED-WORDING.md)
    // and is wired verbatim — the owed register's founding debt, paid.
    'REP_ELIGIBILITY_WITHOUT_REPRESENTATIVE',
    'REP_ELIGIBILITY_NOT_ASSESSED',
  ],

  /* ── S7 · the distribution run's TIER-2 vocabularies ──────────────────────────────────
   * Hand-maintained here; DERIVED FROM SOURCE in `code-source-parity.test.ts`. Both, on purpose:
   * this list is the one a reader audits by eye, that one is the one a new engine member cannot
   * slip past. If they disagree, one of them is wrong and the suite says so twice.
   */

  /** `DistributionStatus` (schema.prisma). ⚠ NOT `ApprovalStatus` — there is no `REJECTED`: a
   * rejected run is `CANCELLED`, and `EXECUTED`/`CANCELLED` are terminal in a database trigger. */
  'distribution.runStatus': [
    'DRAFT',
    'COMPUTED',
    'PENDING_APPROVAL',
    'APPROVED',
    'EXECUTED',
    'CANCELLED',
  ],
  /**
   * `LINE_STATUSES` from the engine. ⚠ `CROSS_BORDER_PENDING` ALSO EXISTS AS A GATE CODE under
   * `errors.domain` — the same spelling, two vocabularies: there it is the reason a payment is
   * held, here it is the state of the line. Both are needed and neither may borrow the other's
   * wording, because a status reads as a fact and a gate reason reads as a cause.
   */
  'distribution.lineStatus': ['PAID', 'WITHHELD', 'CROSS_BORDER_PENDING', 'EXCLUDED'],
  /** `DistributionResult.distributionType` — an inline union in the engine's contract, not a const. */
  'distribution.distributionTypeValue': ['MONETARY', 'NA_DIRECT_USE'],
  /** `RECEIPT_CLASSES`. The two sides of binding rule 1, and they are never summed together. */
  'distribution.receiptClass': ['INCOME', 'CAPITAL'],
  /** `CAPITAL_SOURCES`. ⚠ These name the SOURCE of a corpus receipt, never its classification —
   * whether expropriation compensation is always capital is a ruling, not a label. */
  'distribution.capitalSource': [
    'SALE_PROCEEDS',
    'ISTIBDAL_PROCEEDS',
    'EXPROPRIATION_COMPENSATION',
    'OTHER',
  ],
  /** `FEE_BASES`. ⚠ No label states a RATE: the 10% ʿushr is the deed's figure and is unverified. */
  'distribution.feeBasis': ['PERCENT_OF_REVENUE', 'PERCENT_OF_NET_INCOME', 'RETAINER'],
  'distribution.timingStatus': ['ON_TIME', 'OVERDUE'],
  /** `DEADLINE_BASES`. ⚠ Neither label names the post-FYE month count — that figure is unverified
   * and lives in a `Setting`, so a label that spelled it would harden it into copy. */
  'distribution.deadlineBasis': ['SHART_SCHEDULE', 'POST_FYE_DEFAULT'],
  'distribution.bindingCalendar': ['EARLIER_OF', 'GREGORIAN', 'HIJRI'],
  'distribution.authorityNoticeType': ['CROSS_BORDER_DISBURSEMENT'],
  /**
   * `RUN_FLAGS`. ⚠ `NA_DIRECT_USE` is ALSO an `EntitlementOrder` member with its own label under
   * `endowments.entitlementOrderValue` — one spelling, two vocabularies again, and the flag's
   * wording is a statement about THIS RUN while the order's is a property of the deed.
   *
   * ⚠ THE THREE REVERSION FLAGS ARE FLAGGED FOR THE PRODUCT OWNER. They are staff-facing
   * operational statements about the CLAUSE's state and are deliberately written that way — but
   * the neighbouring EXCLUSION code `REVERSION_PENDING_LIVING_BLOODLINE` is TIER 1 precisely
   * because "copy that implies an expectation of the family's death is worse than no copy at all",
   * and these three carry adjacent subject matter. If the owner reads them as beneficiary-facing,
   * they move to the owed register.
   */
  'distribution.flag': [
    'AUTHORITY_FEE_DETERMINATION_PENDING',
    'NO_ELIGIBLE_BENEFICIARIES',
    'NIL_DISTRIBUTION',
    'NA_DIRECT_USE',
    'CAPITAL_RECEIPTS_EXCLUDED',
    'MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED',
    'TIMING_OVERDUE',
    'UNVERIFIED_FIGURES_APPLIED',
    'STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA',
    'CONTINUATION_STIPULATION_NOT_APPLIED',
    'REVERSION_TO_ULTIMATE_TAKER_APPLIED',
    'REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING',
    'REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED',
  ],
  /**
   * `INVARIANT_IDS` — TWELVE, and three of them are HYPHENATED (`I-C1`, `I-L1`, `I-R1`).
   *
   * ⚠ The hyphens are the reason `code-source-parity.test.ts`'s `parseConstArray` had to be
   * widened in S7: its literal pattern was `[A-Z][A-Z0-9_]*`, which silently parsed this array as
   * NINE members and would have asserted copy for I1–I9 while reporting success about the three
   * that carry the corpus, per-capita and reversion guarantees. Measured before and after.
   *
   * ⚠ `I8` (determinism) is a member of the vocabulary and therefore needs a label, but the engine
   * NEVER lists it in `invariantsChecked` — it is a claim about two runs and is unprovable from
   * one. Its label says so, rather than reading like something that was verified.
   */
  'distribution.invariant': [
    'I1',
    'I2',
    'I3',
    'I4',
    'I5',
    'I6',
    'I7',
    'I8',
    'I9',
    'I-C1',
    'I-L1',
    'I-R1',
  ],
  /** `TRACE_STAGES`. The stage names only — every trace `message` and `code` is FROZEN COPY inside
   * the hashed bytes and is rendered as a machine code, never translated. */
  'distribution.traceStage': [
    'INPUT',
    'WATERFALL',
    'RESOLVER',
    'GATES',
    'TIMING',
    'ALLOCATE',
    'INVARIANTS',
  ],
  /** `MAPPING_DIAGNOSTICS` from `packages/api/src/distribution/refusal.ts` — the api's own
   * non-refusing channel, outside the run digest. Owed to S7-5 by that file's header. */
  'distribution.diagnostic': [
    'MAINTENANCE_DEED_RULE_WINS_OVER_RECORDED_NAZIR_DISCRETION',
    'MAINTENANCE_PERCENT_RATE_NOT_EXACTLY_REPRESENTABLE',
    'MAINTENANCE_POLICY_UNACKNOWLEDGED',
    'NAZIR_FEE_DEED_SILENT_CONFIGURED_FIGURE_NOT_SUBSTITUTED',
    'NAZIR_FEE_DEED_RATE_DISAGREES_WITH_CONFIGURED_FIGURE',
    'OPERATING_COST_EXPENSE_CATEGORY_EXCLUDED',
    'LEDGER_REVERSED_PAIR_EXCLUDED',
    'CAPITAL_RECEIPTS_PASSED_TO_ENGINE',
    'SHART_ADVISORY_GAP',
    'DISBURSING_ENTITY_HAS_NO_COLUMN',
    'BANKING_REF_FOR_PROCEEDS_HAS_NO_COLUMN',
  ],
  /** `MappingDiagnosticSeverity` — two values on purpose; a numeric scale invites "medium". */
  'distribution.diagnosticSeverity': ['CONFLICT', 'NOTICE'],
  // ⊕ S11 · 2b — the compliance board's vocabularies. Hand lists HERE; code-source-parity parses the same
  // members off their declaring sources (rules.ts · board-state.ts · schema.prisma) and pins both ways.
  'dashboard.rule': [
    'REGISTER_30BD',
    'UPDATE_15BD',
    'ISTIBDAL_10BD',
    'DISTRIBUTE_3M_FYE',
    'KYC_REFRESH',
    'LICENSE_RENEWAL',
    'CONTRACT_RENEWAL',
    'HEARING',
    'RETENTION_10Y',
  ],
  'dashboard.state': [
    'pending',
    'due_soon',
    'at_risk',
    'overdue',
    'met',
    'waived',
    'cannot_compute',
  ],
  'dashboard.cause': [
    'NOT_RECORDED',
    'RECORDED_NOT_COMPUTABLE',
    'ROUTED_NO_HOME',
    'NOT_COMPUTED',
    'NOT_IN_SCOPE_YET',
    'NO_SUBJECT',
  ],
  'dashboard.tone': ['danger', 'warning', 'success', 'refused'],
  'dashboard.filings.platform': ['AWQAF_DIGITAL', 'BALADI', 'EJAR', 'ISTIHKAM', 'MUQEEM', 'QIWA'],
  'dashboard.filings.status': [
    'NOT_STARTED',
    'IN_PROGRESS',
    'SUBMITTED',
    'ACCEPTED',
    'REJECTED',
    'N_A',
  ],
};

describe('every group looked up by machine code is exhaustive in both locales', () => {
  const leafKeys = { ar: new Set(arKeys), en: new Set(enKeys) } as const;

  it.each(Object.keys(CODE_KEYED_GROUPS))('%s has a message for every member', (group) => {
    const members = CODE_KEYED_GROUPS[group] as readonly string[];
    for (const locale of locales) {
      const missing = members.filter((member) => !leafKeys[locale].has(`${group}.${member}`));
      expect(missing, `${group} is missing ${locale} copy`).toEqual([]);
    }
  });

  it.each(Object.keys(CODE_KEYED_GROUPS))(
    '%s carries no member this file does not name',
    (group) => {
      // The other direction. An extra member means an enum was renamed and the old label was left
      // behind — dead copy a translator keeps maintaining, and a hint that the NEW value has none.
      const declared = new Set(CODE_KEYED_GROUPS[group] as readonly string[]);
      const prefix = `${group}.`;
      for (const locale of locales) {
        const actual = (locale === 'ar' ? arKeys : enKeys)
          .filter((key) => key.startsWith(prefix))
          .map((key) => key.slice(prefix.length));
        expect(
          actual.filter((member) => !declared.has(member)),
          `${group} in ${locale}`,
        ).toEqual([]);
      }
    },
  );

  it('would catch a group with a missing member (self-test)', () => {
    // An assertion over an empty set is worthless: prove the lookup actually resolves keys.
    expect(leafKeys.ar.has('endowments.classificationValue.MEDIUM')).toBe(true);
    expect(leafKeys.ar.has('endowments.classificationValue.ENORMOUS')).toBe(false);
  });
});
