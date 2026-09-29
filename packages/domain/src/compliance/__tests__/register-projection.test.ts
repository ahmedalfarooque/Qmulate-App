/**
 * `register-projection.test.ts` — what the CATALOGUE hands the REGISTER, and what it withholds.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A SEPARATE FILE FROM THE FIDELITY SUITE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `catalogue-source-fidelity.test.ts` answers *"is the catalogue a faithful copy of its two
 * sources"*. This answers a different question with a different owner: *"which of those rows can the
 * DATABASE hold, and what classification does each carry when it gets there"*. The first is about
 * transcription; the second is about a NOT NULL column and an owner ruling, and neither belongs in
 * the other's file.
 *
 * Two properties, both of which fail SILENTLY if nobody asserts them:
 *
 *  1. **The withheld set.** `compliance_obligation.titleAr` is NOT NULL; one template has no Arabic.
 *     If the derivation stops working, the seed either crashes on a NOT NULL violation (loud, fine)
 *     or — far worse, if someone "fixes" it with an empty string — ships a legal-facing obligation
 *     with a blank Arabic title that renders as a broken row on an Arabic-first product.
 *  2. **The compartment list.** A misspelled code in `AML_RESTRICTED_TEMPLATE_CODES` classifies
 *     NOTHING. `GOV-AML-02` then seeds `NORMAL`, the duty to report suspicion to the FIU goes back
 *     on the general register in front of eleven of thirteen role presets, and **nothing
 *     malfunctions** — no error, no red test, no status code. That is the S8-Q1 leak restored by a
 *     typo, which is why the check runs at module load and why its failure path is driven here
 *     rather than merely present.
 *
 * ⚠ **EVERY NEGATIVE BELOW IS PAIRED WITH THE POSITIVE IT MUST STILL PERMIT.** That is this sprint's
 * own lesson, learned twice the hard way: Q2 and Q1 both broke by DENYING THE ENTITLED PARTY, and a
 * suite of refusal assertions stays green straight through an outage. So "exactly one row is
 * restricted" is asserted together with "the other thirty-six are NORMAL and are still stored".
 */

import { describe, expect, it } from 'vitest';

import {
  OBLIGATION_LIBRARY,
  OBLIGATION_LIBRARY_VERSION,
  assertCompartmentedCodesResolve,
  storableTemplates,
  templatesWithheldFromRegister,
} from '../catalogue.js';
import {
  AML_RESTRICTED_TEMPLATE_CODES,
  UNSOURCED_ARABIC_SUBJECTS,
  templateConfidentiality,
} from '../contract.js';

describe('the withheld set — what `compliance_obligation` cannot hold, and why', () => {
  it('is exactly GOV-COI-01 today, named rather than counted', () => {
    // Named, not `toHaveLength(1)`: a count is satisfied by the WRONG row being withheld, which
    // would silently drop a real duty while leaving this assertion green.
    expect(templatesWithheldFromRegister().map((entry) => entry.code)).toStrictEqual([
      'GOV-COI-01',
    ]);
  });

  it('is DERIVED from the null Arabic, not hand-listed — so it empties by itself', () => {
    // The whole point of deriving it. If somebody supplies GOV-COI-01's Arabic, this set must shrink
    // without anybody remembering to edit a list — and the assertion above then goes red, forcing
    // the seed count to move deliberately.
    const nullArabic = OBLIGATION_LIBRARY.filter((entry) => entry.titleAr === null).map(
      (entry) => entry.code,
    );
    expect(templatesWithheldFromRegister().map((entry) => entry.code)).toStrictEqual(nullArabic);
  });

  it('carries the MEASURED reason, quoted from the map that measured it', () => {
    const [withheld] = templatesWithheldFromRegister();
    expect(withheld).toBeDefined();
    // Not "a non-empty string": the reason must be the one `UNSOURCED_ARABIC_SUBJECTS` records,
    // because that is where the grep behind the claim lives. A withheld row explained by freshly
    // written prose is a row explained by nobody's measurement.
    expect(withheld?.reason).toBe(UNSOURCED_ARABIC_SUBJECTS['GOV-COI-01']);
    expect(withheld?.reason).toContain('NO BULLET IN');
  });

  it('storableTemplates() is the catalogue MINUS the withheld set, and is otherwise complete', () => {
    const storable = storableTemplates();
    const withheld = new Set(templatesWithheldFromRegister().map((entry) => entry.code));

    // THE LIVENESS HALF. "36 rows" alone is satisfied by dropping the wrong 1; this asserts that
    // every template not withheld IS handed to the seed, which is the property a register depends on.
    expect(storable.map((entry) => entry.code)).toStrictEqual(
      OBLIGATION_LIBRARY.filter((entry) => !withheld.has(entry.code)).map((entry) => entry.code),
    );
    expect(storable).toHaveLength(OBLIGATION_LIBRARY.length - withheld.size);
    // 37 at 2026-08-20.1 (the E7 measurement stands AS that version's number); 41 at
    // 2026-08-26.1 — the S8-Q9/S8-Q8a additions, not a correction of 37.
    expect(OBLIGATION_LIBRARY).toHaveLength(41);
    // 36 at 2026-08-20.1; 40 at 2026-08-26.1 (41 rows − GOV-COI-01, still withheld: its Arabic
    // is still nowhere in the framework and the owner's alternative is still on the table).
    expect(storable).toHaveLength(40);
  });

  it('every storable row has the Arabic the NOT NULL column demands', () => {
    for (const template of storableTemplates())
      expect(template.titleAr, `${template.code} would violate titleAr NOT NULL`).not.toBeNull();
    // And it is real Arabic rather than a transliteration or a placeholder — the same range check
    // the two integration suites run over the seeded rows, asserted here where it is cheap.
    for (const template of storableTemplates())
      expect(template.titleAr ?? '', `${template.code}`).toMatch(/[؀-ۿ]/);
  });

  it('every storable row carries the published library version, not the placeholder marker', () => {
    // 2026-08-26.1 since S9-2's owner-ruled bump (S8-Q9 + S8-Q8a/b); was 2026-08-20.1 from E7.
    expect(OBLIGATION_LIBRARY_VERSION).toBe('2026-08-26.1');
    for (const template of storableTemplates())
      expect(template.libraryVersion).toBe(OBLIGATION_LIBRARY_VERSION);
    // `'fixture-derived'` belongs to the ten rows derived backwards from fixture tasks. A canonical
    // row wearing it would make the two libraries indistinguishable from the row, which is the one
    // thing S8-Q5's versioning exists to prevent.
    for (const template of storableTemplates())
      expect(template.libraryVersion).not.toBe('fixture-derived');
  });
});

describe('S8-Q1 — the compartmented obligation, and only that one', () => {
  it('classifies GOV-AML-02 AML_RESTRICTED', () => {
    expect(templateConfidentiality('GOV-AML-02')).toBe('AML_RESTRICTED');
  });

  it('classifies EVERY OTHER storable template NORMAL — exactly one restricted row', () => {
    const restricted = storableTemplates()
      .filter((entry) => templateConfidentiality(entry.code) === 'AML_RESTRICTED')
      .map((entry) => entry.code);
    // Both halves of "compartment the ROW, not the REGISTER": the set is a singleton AND it is the
    // right singleton. A second restricted row would hide an ordinary duty from the compliance
    // board, which is an outage wearing the costume of a security control.
    expect(restricted).toStrictEqual(['GOV-AML-02']);

    const normal = storableTemplates().filter(
      (entry) => templateConfidentiality(entry.code) === 'NORMAL',
    );
    // 35 at 2026-08-20.1; 39 at 2026-08-26.1 (all four additions are NORMAL — the one
    // AML_RESTRICTED row stays exactly GOV-AML-02).
    expect(normal).toHaveLength(39);
  });

  it('the declared list and the classifier agree, in both directions', () => {
    expect([...AML_RESTRICTED_TEMPLATE_CODES]).toStrictEqual(['GOV-AML-02']);
    for (const code of AML_RESTRICTED_TEMPLATE_CODES)
      expect(templateConfidentiality(code)).toBe('AML_RESTRICTED');
    // The reverse: nothing the classifier restricts may be missing from the declared list, or the
    // ruling's record and the behaviour would drift apart with no test in between.
    const declared = new Set(AML_RESTRICTED_TEMPLATE_CODES);
    for (const entry of OBLIGATION_LIBRARY)
      if (templateConfidentiality(entry.code) === 'AML_RESTRICTED')
        expect(declared.has(entry.code), `${entry.code} restricted but not declared`).toBe(true);
  });

  it('an unknown code answers NORMAL rather than restricting the world', () => {
    // Deliberately NOT fail-closed, and the contract explains why at length: answering
    // AML_RESTRICTED for anything unrecognised would compartment the entire register the first time
    // a code was mistyped. The fail-closed duty is discharged one layer up, by the next test.
    expect(templateConfidentiality('NOT-A-CODE')).toBe('NORMAL');
    expect(templateConfidentiality('')).toBe('NORMAL');
  });

  it('THE FAIL-CLOSED HALF — a declared code that matches no template REFUSES AT LOAD', () => {
    // The failure path, driven rather than assumed. This is the assertion that makes the previous
    // one safe: `templateConfidentiality` may answer NORMAL for an unknown code precisely because an
    // unknown code cannot survive module load to reach it.
    expect(() => {
      assertCompartmentedCodesResolve(['GOV-AML-2']);
    }).toThrow(/GOV-AML-2.*not a template/s);
    expect(() => {
      assertCompartmentedCodesResolve(['GOV-AML-02']);
    }).not.toThrow();
    // And the real list passes it — which is what the module-load call proves on every import.
    expect(() => {
      assertCompartmentedCodesResolve(AML_RESTRICTED_TEMPLATE_CODES);
    }).not.toThrow();
  });
});
