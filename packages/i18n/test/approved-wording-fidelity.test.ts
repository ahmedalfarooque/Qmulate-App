/**
 * `approved-wording-fidelity.test.ts` — the catalogues carry Fadwa's approved statement wording
 * BYTE-FOR-BYTE, or they carry nothing.
 *
 * The wording in `docs/product/statement-copy/APPROVED-WORDING.md` is product-approved legal text
 * (the machine transcription of the ANSWERED drafting brief — see that file's header for the
 * provenance chain back to the .docx). Engineering may not edit it, "improve" it, fix its typos, or
 * translate around it: the Arabic IS the legal statement (NFR-01), and the one known anomaly — an
 * untranslated Arabic word inside item 6's ENGLISH — is transcribed as delivered and flagged to the
 * owner, deliberately NOT repaired here.
 *
 * This file is the catalogue-side half of the verbatim discipline (the S8 catalogue-as-code
 * precedent): the record file is parsed as TEXT, and every wired key must equal its recorded
 * wording exactly. A retyped character, a "tidied" space, a smart-quote normalisation — anything a
 * well-meaning edit or a formatter could do to the catalogue strings — turns this red.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Locale } from '../src/config';

const RECORD_PATH = fileURLToPath(
  new URL('../../../docs/product/statement-copy/APPROVED-WORDING.md', import.meta.url),
);
const AR_PATH = fileURLToPath(new URL('../messages/ar.json', import.meta.url));
const EN_PATH = fileURLToPath(new URL('../messages/en.json', import.meta.url));

type Catalogue = { [key: string]: string | Catalogue };
const readJson = (path: string): Catalogue => JSON.parse(readFileSync(path, 'utf8')) as Catalogue;
const catalogues: Record<Locale, Catalogue> = { ar: readJson(AR_PATH), en: readJson(EN_PATH) };

/** Where each recorded code's wording lives in the catalogues. */
const GROUP_OF: Readonly<Record<string, string>> = {
  UPPER_TABAQA_EXTANT: 'distribution.exclusionReason',
  TABAQA_EXTINCT: 'distribution.exclusionReason',
  ZERO_STIPULATED_WEIGHT: 'distribution.exclusionReason',
  BUTUN_LINE_NOT_CONTINUED: 'distribution.exclusionReason',
  ENTITLEMENT_HELD_BY_LIVING_ANCESTOR: 'distribution.exclusionReason',
  LINEAGE_PER_CAPITA_ZUHUR_ONLY: 'distribution.entitlementRule',
  LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN: 'distribution.entitlementRule',
  ORDERED_LOWEST_LIVING_TABAQA: 'distribution.entitlementRule',
  SHARED_ALL_LIVING_TABAQAT: 'distribution.entitlementRule',
  JOINT_FIXED_DEED_SHARES: 'distribution.entitlementRule',
  STALE_KYC: 'distribution.withheldReason',
  KYC_UNVERIFIED: 'distribution.withheldReason',
  CROSS_BORDER_PENDING: 'distribution.withheldReason',
  REP_ELIGIBILITY_WITHOUT_REPRESENTATIVE: 'endowments.eligibility.reasons',
  REP_ELIGIBILITY_NOT_ASSESSED: 'endowments.eligibility.reasons',
};

/** Parse the record's generated section: `### CODE` → `**ar:** …` / `**en:** …`. */
function parseRecord(): Record<string, { ar: string; en: string }> {
  const text = readFileSync(RECORD_PATH, 'utf8');
  const begin = text.indexOf('<!-- BEGIN GENERATED WORDING -->');
  const end = text.indexOf('<!-- END GENERATED WORDING -->');
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error('APPROVED-WORDING.md: the generated-wording markers are missing or reordered');
  }
  const section = text.slice(begin, end);
  const out: Record<string, { ar: string; en: string }> = {};
  const blocks = section.split(/^### /m).slice(1);
  for (const block of blocks) {
    const [head, ...rest] = block.split('\n');
    const code = (head ?? '').trim();
    const body = rest.join('\n');
    const ar = /\*\*ar:\*\* ([^\n]+)/.exec(body)?.[1];
    const en = /\*\*en:\*\* ([^\n]+)/.exec(body)?.[1];
    if (code && ar !== undefined && en !== undefined) out[code] = { ar, en };
  }
  return out;
}

const record = parseRecord();

function lookup(locale: Locale, group: string, code: string): string | undefined {
  let node: Catalogue | string | undefined = catalogues[locale];
  for (const segment of [...group.split('.'), code]) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

describe('the wired statement copy is byte-identical to the transcription record', () => {
  it('the record parses to exactly the fifteen wired codes — the parse is not blind', () => {
    expect(Object.keys(record).sort()).toEqual(Object.keys(GROUP_OF).sort());
  });

  it.each(Object.keys(GROUP_OF))('%s — ar and en match the record exactly', (code) => {
    const group = GROUP_OF[code] as string;
    for (const locale of ['ar', 'en'] as const) {
      expect(
        lookup(locale, group, code),
        `${group}.${code} [${locale}] must equal APPROVED-WORDING.md byte-for-byte — if the record ` +
          `is right and the catalogue drifted, restore the catalogue; if the wording was re-issued, ` +
          `regenerate the record FROM THE DOCX first, never by editing either file by hand`,
      ).toBe(record[code]?.[locale]);
    }
  });

  it('item 6’s English carries the Arabic word — RULED as-is; only a drafter re-issue may change it', () => {
    // Pinned so a well-meaning edit cannot silently "correct" product legal text — and the pin is
    // now the RULED state, not an open flag: the owner selected "Wire as-is now" (2026-08-24, memo
    // S8 addendum third batch, `241fcf0`). When the drafter re-issues the sentence, the docx →
    // record → catalogue chain updates together and THIS assertion is updated in the same change,
    // citing the re-issue.
    expect(
      lookup('en', 'distribution.exclusionReason', 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR'),
    ).toContain('محفوظًا');
  });
});
