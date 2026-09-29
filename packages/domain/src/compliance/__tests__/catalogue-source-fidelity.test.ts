/**
 * `catalogue-source-fidelity.test.ts` — the obligation library against BOTH of its sources.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS FOR
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `catalogue.ts` holds 37 obligation templates whose content is not this repository's to invent:
 *
 *   · the ENGLISH half comes from `docs/product/prd/09-compliance-deadline-engine-spec.md`'s library
 *     tables (code, workstream, obligation text, gate, recurrence, deadline rule, traces);
 *   · the ARABIC half comes from `docs/domain/unified-framework.md` — QMULATE's own
 *     Arabic-authoritative restatement of the Nazarah regulation, and the document §09's library was
 *     derived FROM.
 *
 * So the catalogue is a TRANSCRIPTION, and a transcription's only real defect mode is drift that
 * looks like content. This file re-reads both sources and compares, and it compares the Arabic
 * **character by character** — because a paraphrase of a regulation is indistinguishable, to every
 * reader downstream, from the regulation.
 *
 * ⚠ **AND IT CHECKS THE JUDGEMENT, NOT ONLY THE TYPING.** A verbatim quote from the WRONG bullet is
 * still wrong, and it would pass any quote-only check. §09's own `Traces` column names the framework
 * subsection each template derives from (`§3-4`, `§1-1`, …), which gives an independent, mechanical
 * constraint on the mapping: a template traced to §3-4 may only quote a bullet from §3-4. That
 * constraint is not something anybody asserted by hand — it is read off the spec.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY BOTH SOURCES ARE READ AS TEXT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/domain` imports nothing internal, and a Markdown document has no importable form anyway.
 * `node:fs` is legal in this package's test files only — the same licence
 * `classification-parity.test.ts` uses to read `schema.prisma`, and for the same reason: a text read
 * cannot be satisfied by a stale generated artefact.
 *
 * ⚠ Both parsers carry a TRUSTWORTHINESS GUARD, and they are not decoration. Measured in S8 while
 * building this: breaking the model-name regex in the sibling `scoping-coverage` suite left its
 * dangerous-direction assertion **passing vacuously over an empty parse** — the parse found nothing,
 * so nothing was missing. A comparison whose inputs can silently become empty is the R6-C1 shape at
 * one level down.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { OBLIGATION_LIBRARY, OBLIGATION_LIBRARY_VERSION } from '../catalogue.js';
import {
  CROSS_SUBSECTION_COVERAGE,
  GATE_FROM_SPEC,
  SPEC_FROM_GATE,
  FRAMEWORK_BULLETS_WITHOUT_TEMPLATE,
  SOURCE_SILENT_FIELDS,
  UNRESOLVED_DEADLINE_BINDINGS,
  UNRESOLVED_RECURRENCE_SUBJECTS,
  UNSOURCED_ARABIC_SUBJECTS,
} from '../contract.js';

const FRAMEWORK = readFileSync(
  fileURLToPath(new URL('../../../../../docs/domain/unified-framework.md', import.meta.url)),
  'utf8',
);

const SPEC = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../docs/product/prd/09-compliance-deadline-engine-spec.md',
      import.meta.url,
    ),
  ),
  'utf8',
);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Parsers — each one guarded, because an empty parse makes every comparison below vacuous
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface Bullet {
  readonly id: string;
  readonly subsection: string;
  readonly ordinal: number;
  readonly line: number;
  readonly text: string;
}

/** Every `- …` bullet under every `### <subsection>` heading of the unified framework. */
function frameworkBullets(): readonly Bullet[] {
  const out: Bullet[] = [];
  let subsection: string | null = null;
  let ordinal = 0;
  const lines = FRAMEWORK.split('\n');
  for (const [index, line] of lines.entries()) {
    const heading = /^### (\S+)/.exec(line);
    if (heading) {
      subsection = heading[1]!;
      ordinal = 0;
      continue;
    }
    if (subsection !== null && line.startsWith('- ')) {
      ordinal += 1;
      out.push({
        id: `${subsection}#${ordinal}`,
        subsection,
        ordinal,
        line: index + 1,
        text: line.slice(2),
      });
    }
  }
  return out;
}

interface SpecRow {
  readonly code: string;
  readonly workstreamEn: string;
  readonly titleEn: string;
  readonly gate: string;
  readonly recurrenceRaw: string;
  readonly deadlineRaw: string;
  readonly subsections: readonly string[];
}

/** Every row of §09's three obligation-library tables. */
function specRows(): readonly SpecRow[] {
  const unlink = (cell: string): string =>
    cell
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*/g, '')
      .trim();

  const out: SpecRow[] = [];
  for (const line of SPEC.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(unlink);
    if (cells.length < 7) continue;
    const code = cells[0] ?? '';
    if (!/^(FIN|OPS|GOV)-/.test(code)) continue;
    const traces = cells[6] ?? '';
    out.push({
      code,
      workstreamEn: cells[1] ?? '',
      titleEn: cells[2] ?? '',
      gate: (cells[3] ?? '').replace(/`/g, ''),
      recurrenceRaw: cells[4] ?? '',
      deadlineRaw: (cells[5] ?? '').replace(/`/g, ''),
      subsections: [...traces.matchAll(/§(\d+-\d+)/g)].map((match) => match[1]!),
    });
  }
  return out;
}

describe('both source reads are trustworthy', () => {
  it('the framework parse finds all 93 bullets across 17 subsections', () => {
    const bullets = frameworkBullets();
    expect(bullets.length).toBe(93);
    expect(new Set(bullets.map((bullet) => bullet.subsection)).size).toBe(17);
  });

  it('POSITIVE CONTROL — a bullet whose text this test names by hand is found', () => {
    // The istibdal notice (§3-5#4). If the parser stops matching, this fails rather than every
    // comparison below quietly succeeding over nothing.
    const bullets = frameworkBullets();
    const istibdal = bullets.find((bullet) => bullet.id === '3-5#4');
    expect(istibdal?.text).toContain('عشرة أيام عمل');
  });

  it('the §09 parse finds all 41 library rows, each with a §X-Y trace', () => {
    const rows = specRows();
    // 37 at 2026-08-20.1; 41 at 2026-08-26.1 (the S8-Q9 additions FIN-MGT-05/FIN-DIST-03/
    // GOV-GEN-04 + the S8-Q8a split's GOV-SHART-03) — §09's tables were amended WITH the bump.
    expect(rows.length).toBe(41);
    expect(rows.filter((row) => row.subsections.length === 0)).toEqual([]);
  });
});

describe('the catalogue covers §09 exactly — both directions', () => {
  it('every §09 template is in the catalogue', () => {
    const have = new Set(OBLIGATION_LIBRARY.map((entry) => entry.code));
    const missing = specRows()
      .map((row) => row.code)
      .filter((code) => !have.has(code));
    expect(
      missing,
      `${missing.length} statutory obligation(s) in §09 are absent from the library: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the catalogue invents no template §09 does not have', () => {
    const spec = new Set(specRows().map((row) => row.code));
    const extra = OBLIGATION_LIBRARY.map((entry) => entry.code).filter((code) => !spec.has(code));
    expect(extra, `the library carries ${extra.length} code(s) §09 never declared`).toEqual([]);
  });

  it('codes are unique and the library version is stamped on every row', () => {
    const codes = OBLIGATION_LIBRARY.map((entry) => entry.code);
    expect(new Set(codes).size, 'a duplicate code would make the catalogue ambiguous').toBe(
      codes.length,
    );
    for (const entry of OBLIGATION_LIBRARY)
      expect(entry.libraryVersion).toBe(OBLIGATION_LIBRARY_VERSION);
  });
});

describe('the English half is §09, transcribed', () => {
  it.each(['titleEn', 'gate', 'workstreamEn'] as const)('%s matches §09 cell for cell', (field) => {
    const bySpec = new Map(specRows().map((row) => [row.code, row]));
    const wrong: string[] = [];
    for (const entry of OBLIGATION_LIBRARY) {
      const row = bySpec.get(entry.code);
      if (row === undefined) continue; // covered by the coverage test above
      // `gate` is compared THROUGH the declared bridge: the catalogue carries the enum spelling so the
      // gating resolver can consume it directly, §09 carries lowercase, and GATE_FROM_SPEC is the one
      // place that correspondence is written down.
      const expected = field === 'gate' ? GATE_FROM_SPEC[row.gate] : row[field];
      if (entry[field] !== expected)
        wrong.push(`${entry.code}.${field}: ${String(entry[field])} !== ${String(expected)}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe('the ARABIC half is QUOTED, byte for byte', () => {
  it('a NULL titleAr appears only where the framework genuinely has no bullet', () => {
    // The null is a finding, not a hole, so it is pinned from both sides: a row may only be null if
    // UNSOURCED_ARABIC_SUBJECTS names it, and there must be at least one — if the framework ever
    // gains the missing obligation, this test fails and the entry has to come out.
    const nulls = OBLIGATION_LIBRARY.filter((entry) => entry.titleAr === null).map((e) => e.code);
    expect(nulls.length, 'a null titleAr that nobody declared').toBeGreaterThan(0);
    for (const code of nulls)
      expect(
        Object.keys(UNSOURCED_ARABIC_SUBJECTS),
        `${code} has no Arabic and no entry explaining why`,
      ).toContain(code);
  });

  it('every titleAr is a real framework bullet, character for character', () => {
    const byText = new Map(frameworkBullets().map((bullet) => [bullet.text, bullet]));
    const problems: string[] = [];

    for (const entry of OBLIGATION_LIBRARY) {
      if (entry.titleAr === null) continue; // covered by the test above
      const found = byText.get(entry.titleAr);
      if (found === undefined) {
        // Report the near-miss against the CITED bullet, so the failure is actionable rather than
        // just "not found" — a dropped clause and a rewritten sentence read very differently.
        const cite0 = entry.frameworkBullets[0];
        const cited =
          cite0 === undefined
            ? undefined
            : frameworkBullets().find(
                (bullet) => bullet.id === `${cite0.subsection}#${cite0.ordinal}`,
              );
        problems.push(
          `${entry.code}: titleAr is NOT a verbatim bullet.\n` +
            `      got:  ${entry.titleAr}\n` +
            `      cited ${entry.frameworkBullets[0]?.subsection}#${entry.frameworkBullets[0]?.ordinal}: ${cited?.text ?? '(cited bullet not found)'}`,
        );
        continue;
      }
      const cite = entry.frameworkBullets[0];
      if (cite === undefined) {
        problems.push(`${entry.code}: quotes a real bullet but cites none`);
      } else if (`${cite.subsection}#${cite.ordinal}` !== found.id) {
        problems.push(
          `${entry.code}: quote is verbatim ${found.id} but the row cites ${cite.subsection}#${cite.ordinal}`,
        );
      }
    }

    expect(
      problems,
      "The Arabic in this catalogue is the regulation's own text recorded as data. A paraphrase " +
        'here is indistinguishable downstream from the regulation itself.\n' +
        problems.join('\n'),
    ).toEqual([]);
  });

  it('every cited bullet really exists, and its recorded line is right', () => {
    const byId = new Map(frameworkBullets().map((bullet) => [bullet.id, bullet]));
    const problems: string[] = [];
    for (const entry of OBLIGATION_LIBRARY)
      for (const cite of entry.frameworkBullets) {
        const id = `${cite.subsection}#${cite.ordinal}`;
        const bullet = byId.get(id);
        if (bullet === undefined) problems.push(`${entry.code} cites ${id}, which does not exist`);
        else if (bullet.line !== cite.line)
          problems.push(`${entry.code} cites ${id} at line ${cite.line}; it is at ${bullet.line}`);
      }
    expect(problems).toEqual([]);
  });

  it('THE JUDGEMENT CHECK — the QUOTED bullet comes from the subsection §09 traces the row to', () => {
    // A verbatim quote from the wrong bullet passes every check above, so this is the one that
    // checks the mapping rather than the typing. §09's Traces column is the independent constraint —
    // it names the framework subsection each template derives from — so nothing here is asserted by
    // hand. STRICT on the primary bullet, because that is the one `titleAr` quotes.
    const traced = new Map(specRows().map((row) => [row.code, row.subsections]));
    const problems: string[] = [];
    for (const entry of OBLIGATION_LIBRARY) {
      const allowed = traced.get(entry.code);
      const primary = entry.frameworkBullets[0];
      if (allowed === undefined || allowed.length === 0 || primary === undefined) continue;
      if (!allowed.includes(primary.subsection))
        problems.push(
          `${entry.code} QUOTES §${primary.subsection}, but §09 traces it to §${allowed.join(' / §')}`,
        );
    }
    expect(problems).toEqual([]);
  });

  it('wider coverage than §09 traces is DECLARED, never incidental', () => {
    // Some duties are genuinely restated across subsections — archiving appears in §3-6, §3-7 and
    // §3-9 in near-identical Arabic — so a template may legitimately cover more than its trace. It
    // may not do so silently: strict where the quote is, declared where the span is real. Asserted
    // both ways, so a stale declaration is a failure too.
    const traced = new Map(specRows().map((row) => [row.code, row.subsections]));
    const spanning: string[] = [];
    for (const entry of OBLIGATION_LIBRARY) {
      const allowed = traced.get(entry.code) ?? [];
      const outside = entry.frameworkBullets
        .slice(1)
        .filter((cite) => !allowed.includes(cite.subsection));
      if (outside.length > 0) spanning.push(entry.code);
    }
    expect([...spanning].sort()).toEqual(Object.keys(CROSS_SUBSECTION_COVERAGE).sort());
  });
});

describe('the open questions are carried as DATA, in both directions', () => {
  const MAPS = {
    recurrence: UNRESOLVED_RECURRENCE_SUBJECTS,
    deadline: UNRESOLVED_DEADLINE_BINDINGS,
    arabic: UNSOURCED_ARABIC_SUBJECTS,
  } as const;

  it.each(Object.keys(MAPS) as (keyof typeof MAPS)[])(
    'every row named in the %s map carries that exact reason',
    (which) => {
      for (const [code, reason] of Object.entries(MAPS[which])) {
        const entry = OBLIGATION_LIBRARY.find((row) => row.code === code);
        expect(
          entry,
          `${code} is named in the ${which} map but is not in the library`,
        ).toBeDefined();
        expect(
          entry?.unresolved,
          `${code} is named in the ${which} map but its row does not carry the reason`,
        ).toContain(reason);
      }
    },
  );

  it('every row carrying a question is named — a question cannot quietly stop being asked', () => {
    // THE DIRECTION THAT MATTERS. Without it a reason could be edited onto a row and tracked by
    // nothing, which is how the five premature closures on this project's record happened.
    const declared = new Set(Object.values(MAPS).flatMap((map) => Object.values(map)));
    const orphans: string[] = [];
    for (const entry of OBLIGATION_LIBRARY)
      for (const reason of entry.unresolved)
        if (!declared.has(reason)) orphans.push(`${entry.code}: ${reason.slice(0, 60)}…`);
    expect(orphans).toEqual([]);
  });

  it('a resolved row carries NO question, so the list is a real signal', () => {
    const named = new Set(Object.values(MAPS).flatMap((map) => Object.keys(map)));
    const wrong = OBLIGATION_LIBRARY.filter(
      (entry) => entry.unresolved.length > 0 && !named.has(entry.code),
    ).map((entry) => entry.code);
    expect(wrong).toEqual([]);
  });
});

describe('the fields §09 declares but never populates stay NULL', () => {
  it.each(SOURCE_SILENT_FIELDS)('%s is null on every row', (field) => {
    // A plausible-looking default here would be engineering asserting a regulatory or governance
    // fact no source states — and nobody would ever re-examine it. See SOURCE_SILENT_FIELDS.
    const populated = OBLIGATION_LIBRARY.filter(
      (entry) => (entry as unknown as Record<string, unknown>)[field] !== null,
    ).map((entry) => entry.code);
    expect(
      populated,
      `${field} was populated on ${populated.length} row(s); §09's table has no column for it`,
    ).toEqual([]);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE OTHER DIRECTION: WHICH FRAMEWORK DUTIES THE LIBRARY DOES NOT TRACK
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every test above asks whether the catalogue faithfully reflects §09. This one asks the question
 * §09 cannot answer about itself: does the library cover the framework it claims to be derived
 * "1:1" from? It does not — 83 of 93 bullets are covered and 10 are not — and each of the ten is a
 * duty QMULATE's own document says the Nazir owes.
 *
 * Pinned in BOTH directions on purpose. A bullet that falls out of coverage fails here rather than
 * silently stopping being tracked; a bullet that gains a template forces its entry to be deleted,
 * so the list cannot rot into a description of a gap that was closed years ago. That symmetry is the
 * whole mechanism — a one-directional list of known gaps is how a closed gap and an unnoticed one
 * come to look identical.
 */
describe('the library vs the framework — what it does NOT track', () => {
  it('exactly the declared bullets are untracked, and exactly those', () => {
    const covered = new Set(
      OBLIGATION_LIBRARY.flatMap((entry) =>
        entry.frameworkBullets.map((cite) => `${cite.subsection}#${cite.ordinal}`),
      ),
    );
    const untracked = frameworkBullets()
      .map((bullet) => bullet.id)
      .filter((id) => !covered.has(id));

    expect(
      [...untracked].sort(),
      "The library's coverage of the framework changed. If a duty became UNTRACKED, add it to " +
        'FRAMEWORK_BULLETS_WITHOUT_TEMPLATE with what the duty is and whether it is a substantive ' +
        'gap or an umbrella standard. If a duty became TRACKED, delete its entry — a stale gap list ' +
        'is indistinguishable from a real one.',
    ).toEqual(Object.keys(FRAMEWORK_BULLETS_WITHOUT_TEMPLATE).sort());
  });

  it('the count is stated, so "83 of 93" cannot drift into a vague claim', () => {
    const total = frameworkBullets().length;
    const untracked = Object.keys(FRAMEWORK_BULLETS_WITHOUT_TEMPLATE).length;
    expect(total).toBe(93);
    // 10 → 7 at 2026-08-26.1: the owner's S8-Q9 ruling made three of the ten TRACKED
    // (1-2#2 → FIN-MGT-05, 1-3#6 → FIN-DIST-03, 3-3#2 → GOV-GEN-04) and the remaining seven
    // DELIBERATE non-coverage with reasons. "83 of 93" is now "86 of 93", by ruling.
    expect(untracked).toBe(7);
    expect(total - untracked).toBe(86);
  });

  it('every declared untracked bullet really exists in the framework', () => {
    // A typo in the gap list would declare a gap that is not there while hiding one that is.
    const ids = new Set(frameworkBullets().map((bullet) => bullet.id));
    for (const id of Object.keys(FRAMEWORK_BULLETS_WITHOUT_TEMPLATE))
      expect(ids, `${id} is declared untracked but is not a framework bullet`).toContain(id);
  });
});

describe('the gate bridge is total in BOTH directions', () => {
  it('every gate §09 uses has an enum member', () => {
    // The direction that matters: a spec spelling with no bridge entry becomes `undefined`, the
    // comparison above becomes vacuous, and the row ships with a gate the resolver cannot read.
    const used = [...new Set(specRows().map((row) => row.gate))].sort();
    const bridged = used.filter((gate) => GATE_FROM_SPEC[gate] !== undefined);
    expect(
      bridged,
      `unbridged §09 gate(s): ${used.filter((g) => !bridged.includes(g)).join(', ')}`,
    ).toEqual(used);
  });

  it('every bridge entry is reachable from §09, or is the retired one', () => {
    // The other direction, so the bridge cannot accumulate entries nothing uses — except `large_only`,
    // which is retired and deliberately kept so an old row still reaches the engine as RECOGNISED and
    // can be refused BY NAME rather than as an unrecognised value.
    const used = new Set(specRows().map((row) => row.gate));
    const unreachable = Object.keys(GATE_FROM_SPEC).filter((spec) => !used.has(spec));
    expect(unreachable).toEqual(['large_only']);
  });

  it('the reverse map really is the reverse — derived, not restated', () => {
    for (const [spec, gate] of Object.entries(GATE_FROM_SPEC))
      expect(SPEC_FROM_GATE[gate]).toBe(spec);
    expect(Object.keys(SPEC_FROM_GATE)).toHaveLength(Object.keys(GATE_FROM_SPEC).length);
  });

  it('⊕ S8-Q3 LANDED — every gate the library uses is now expressible', () => {
    // ⚠ THIS REPLACES the assertion written to FAIL when the migration landed. It has landed: the enum
    // gained EXCLUDE_DIRECT and HAS_INCOME by the owner's ruling, so the seven previously
    // unrepresentable templates — including FIN-DIST-01/02, the distribution duty itself — are
    // representable. The inverse is now asserted, so a REVERT would be caught.
    const gates = new Set(Object.values(GATE_FROM_SPEC));
    for (const entry of OBLIGATION_LIBRARY)
      expect(gates, `${entry.code} carries an unbridged gate`).toContain(entry.gate);
    expect(gates.has('EXCLUDE_DIRECT')).toBe(true);
    expect(gates.has('HAS_INCOME')).toBe(true);
  });
});
