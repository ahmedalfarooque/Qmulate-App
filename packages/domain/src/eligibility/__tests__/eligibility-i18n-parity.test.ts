/**
 * `eligibility-i18n-parity.test.ts` — every `ELIGIBILITY_REASON_CODES` member has ar **and** en copy.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS, AND WHY IT CAUGHT SOMETHING ON ITS FIRST RUN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §17's E3 exit clause requires the ineligible-Nazir refusal to render **as a human sentence in each
 * language**, not as a bare code. The domain emits the code; `packages/i18n` holds the sentence; nothing
 * compared the two.
 *
 * That gap is not theoretical and it does not fail loudly. **next-intl does not throw for a missing
 * message — it PRINTS THE KEY.** So a mis-keyed reason code shows an Arabic-first user
 * `endowments.eligibility.reasons.SOMETHING` on screen (Arabic is authoritative, NFR-01, not a fallback)
 * while every test in every package stays green. `packages/i18n/test/messages.test.ts`'s own header says
 * exactly this about `errors.*`, and these codes live under a different namespace, so they were outside
 * that suite's two `CODE_LIST_SOURCES` entries.
 *
 * ⚠ **MEASURED, TWICE, ON THE DAY THIS WAS WRITTEN — and the second time is the interesting one.** The
 * domain and the ar/en catalogue were authored in parallel and disagreed on exactly one of the seven
 * codes: the domain emitted `DISQUALIFYING_REMOVAL_RECORDED` while the catalogue keyed
 * `NO_DISQUALIFYING_REMOVAL_REQUIRED`, **in both locales**. The domain side was renamed to match; this
 * file then went RED again, because the catalogue had meanwhile been changed to the domain's original
 * spelling. Both sides had converged on the other. It is now settled on
 * `DISQUALIFYING_REMOVAL_RECORDED`, which is what both files carry.
 *
 * Nothing about that was visible without this test — a mis-keyed code is not a type error, not a runtime
 * throw, and not a failing assertion anywhere else. **Do not rename one of these seven codes without
 * running this file, and do not "fix" it by relaxing the assertion.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * READ AS TEXT, NOT IMPORTED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/domain` imports nothing internal (the eslint domain block enforces it) and
 * `api → i18n` already exists, so an import here would be a cycle in the other direction. The catalogues
 * are read as **text** and parsed — the same technique, and for the same reasons, as
 * `prisma-vocabulary-parity.test.ts` reading `schema.prisma` and `packages/auth`'s role test reading
 * `enum Role`. `node:fs` is legal in this package's test files only. The *engine* still does no I/O.
 *
 * ⚠ This is a **second** guard, deliberately. The canonical home for a code-list-vs-catalogue comparison
 * is `packages/i18n/test/messages.test.ts`, which belongs to another owner; adding
 * `ELIGIBILITY_REASON_CODES` to its `CODE_LIST_SOURCES` (namespace `endowments.eligibility.reasons`) is a
 * handed-off item. Two guards on a failure mode that renders a raw key to a beneficiary is the right
 * number, not one too many.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ELIGIBILITY_REASON_CODES } from '../contract.js';

/** The namespace the catalogue nests these under. Named once so a move fails with a useful message. */
const NAMESPACE = ['endowments', 'eligibility', 'reasons'] as const;

/** ar first: Arabic is the authoritative locale (NFR-01), not a translation of the English. */
const LOCALES = ['ar', 'en'] as const;

function catalogue(locale: (typeof LOCALES)[number]): Record<string, unknown> {
  const raw = readFileSync(
    fileURLToPath(new URL(`../../../../i18n/messages/${locale}.json`, import.meta.url)),
    'utf8',
  );
  const parsed: unknown = JSON.parse(raw);
  let node: unknown = parsed;
  for (const segment of NAMESPACE) {
    if (typeof node !== 'object' || node === null) {
      throw new Error(
        `packages/i18n/messages/${locale}.json has no "${NAMESPACE.join('.')}" block. If the namespace ` +
          `moved, fix NAMESPACE in this file — do not delete the assertion: next-intl prints a missing ` +
          `key instead of throwing, so nothing else would notice.`,
      );
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (typeof node !== 'object' || node === null) {
    throw new Error(`"${NAMESPACE.join('.')}" in ${locale}.json is not an object`);
  }
  return node as Record<string, unknown>;
}

describe('the catalogue read is trustworthy', () => {
  it('finds a non-trivial reasons block in both locales', () => {
    // Without this, a parser that silently produced `{}` would make every assertion below vacuous — and
    // "vacuously green" is the exact failure this file was written to prevent.
    for (const locale of LOCALES) {
      expect(Object.keys(catalogue(locale)).length, locale).toBeGreaterThanOrEqual(
        ELIGIBILITY_REASON_CODES.length,
      );
    }
  });
});

describe('every eligibility reason code renders as a sentence in BOTH locales', () => {
  it.each(ELIGIBILITY_REASON_CODES.map((code) => [code] as const))(
    '%s has ar and en copy',
    (code) => {
      for (const locale of LOCALES) {
        const value = catalogue(locale)[code];
        expect(
          typeof value,
          `packages/i18n/messages/${locale}.json is missing ${NAMESPACE.join('.')}.${code}. ` +
            `next-intl PRINTS THE KEY for a missing message rather than throwing, so without this ` +
            `assertion a ${locale === 'ar' ? 'Nazir reading Arabic' : 'reader'} would see the raw key ` +
            `on a refusal screen and CI would stay green.`,
        ).toBe('string');
        expect(String(value).length, `${locale}.${code}`).toBeGreaterThan(10);
      }
    },
  );

  it('the Arabic copy is actually Arabic (NFR-01 — ar is authoritative, not a fallback)', () => {
    // A code whose "Arabic" is the English string is a missing translation that no key check can see.
    const ar = catalogue('ar');
    for (const code of ELIGIBILITY_REASON_CODES) {
      expect(/[؀-ۿ]/.test(String(ar[code])), `ar.${code} contains no Arabic script`).toBe(true);
    }
  });

  it('⚠ does NOT require the catalogue to be limited to these codes', () => {
    // The api layer owns its own refusals in the same block (`REP_JOINT_LIABILITY_REQUIRED` is theirs,
    // not a criterion), so an EXTRA key is legitimate and this file must not police it. The one-way
    // direction is the whole contract: every code the domain can EMIT must have copy; the catalogue may
    // carry more.
    const en = catalogue('en');
    const extra = Object.keys(en).filter(
      (key) => !(ELIGIBILITY_REASON_CODES as readonly string[]).includes(key),
    );
    expect(Array.isArray(extra)).toBe(true);
  });
});
