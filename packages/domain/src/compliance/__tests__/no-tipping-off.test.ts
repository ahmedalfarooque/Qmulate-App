/**
 * `no-tipping-off.test.ts` — §09 rules 1 and 5, and the honest state of both.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TWO HALVES, AND THE SECOND IS THE ONE THAT MATTERS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  1. `mayDispatch` is exercised EXHAUSTIVELY over its whole input space — 6 channels × 3
 *     confidentiality classes × 3 audit classifications = 54 cells, plus the fail-closed branches.
 *     Nothing is sampled and nothing is generated, because 54 is small enough to enumerate and an
 *     enumerated space cannot have an unreachable corner (R6-C1's lesson: a generator that cannot
 *     emit a configuration reports its silence as success).
 *
 *  2. THE SOURCE CENSUS asserts the outbound universe is still EMPTY. This is the half that makes
 *     rules 1 and 5 honest rather than green: today *"no notification referenced the SAR"* passes
 *     over nothing at all, so instead of asserting the silence, this file asserts **that there is
 *     nothing to be silent about** — and goes RED the moment there is.
 *
 * ⚠ **WHY THAT IS THE RIGHT DELIVERABLE AND A GREEN NEGATIVE WOULD NOT BE.** CENSUS-1's founding
 * incident was a control that reported its own silence as success; migration 26 §3's first draft was
 * deleted for the same reason; and this sprint measured the shape twice more (M10 and M15, where
 * breaking a parser left a coverage assertion passing vacuously). A "no notification was emitted"
 * test written today would join that list. A census that fails when the pipeline arrives cannot.
 *
 * ── WHAT THIS FILE DOES NOT CLAIM ────────────────────────────────────────────────────────────
 * It does not claim G-6. G-6 is *"a SAR is visible only to the compartment; no notification reaches
 * the subject"*; the first clause is proven by
 * `packages/database/test/aml-compartment-structure.integration.test.ts`, and the second stays
 * **NOT PROVEN** until a pipeline exists to be silent. Saying so is the point.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ABSENT_OUTBOUND_PATHS,
  AUDIT_CLASSIFICATIONS,
  CONFIDENTIALITY_CLASSES,
  DISPATCH_REFUSALS,
  OUTBOUND_CHANNELS,
  isOutboundChannel,
  mayDispatch,
} from '../disclosure.js';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · `mayDispatch`, enumerated
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('mayDispatch — the whole input space, enumerated', () => {
  it('covers all 54 cells with no fall-through, and every verdict is coherent', () => {
    let seen = 0;
    for (const channel of OUTBOUND_CHANNELS)
      for (const confidentiality of CONFIDENTIALITY_CLASSES)
        for (const auditClassification of AUDIT_CLASSIFICATIONS) {
          seen += 1;
          const verdict = mayDispatch({ channel, confidentiality, auditClassification });
          // A verdict must never be both, and must never be neither.
          expect(verdict.permitted).toBe(verdict.refusal === null);
          if (verdict.refusal !== null)
            expect(DISPATCH_REFUSALS as readonly string[]).toContain(verdict.refusal);
          expect(verdict.channel).toBe(channel);
        }
    expect(seen).toBe(6 * 3 * 3);
  });

  it('AML_RESTRICTED is refused on EVERY channel, whatever its audit classification', () => {
    for (const channel of OUTBOUND_CHANNELS)
      for (const auditClassification of AUDIT_CLASSIFICATIONS) {
        const verdict = mayDispatch({
          channel,
          confidentiality: 'AML_RESTRICTED',
          auditClassification,
        });
        expect(verdict.permitted, `${channel} permitted an AML_RESTRICTED payload`).toBe(false);
        expect(verdict.refusal).toBe('AML_RESTRICTED_PAYLOAD');
      }
  });

  it('a RESTRICTED audit classification is refused even when the row is not AML_RESTRICTED', () => {
    // The two are independent facts and either one alone must stop a dispatch. `RESTRICTED` covers
    // AML SAR events, and `deriveClassification()` can set it from `action: 'AML_REPORT'` on a row
    // that carries no confidentiality column at all — which is exactly the case a
    // confidentiality-only check would wave through.
    for (const channel of OUTBOUND_CHANNELS)
      for (const confidentiality of ['NORMAL', 'SENSITIVE_PII'] as const) {
        const verdict = mayDispatch({
          channel,
          confidentiality,
          auditClassification: 'RESTRICTED',
        });
        expect(verdict.permitted).toBe(false);
        expect(verdict.refusal).toBe('RESTRICTED_CLASSIFICATION');
      }
  });

  it('POSITIVE CONTROL — an ordinary payload IS permitted, on every channel', () => {
    // Without this the function could refuse everything and pass every test above. A control that
    // cannot say yes is not a control, it is an outage — and the first person to hit it would
    // relax it rather than route around it.
    for (const channel of OUTBOUND_CHANNELS)
      for (const confidentiality of ['NORMAL', 'SENSITIVE_PII'] as const)
        for (const auditClassification of ['ROUTINE', 'SENSITIVE'] as const)
          expect(
            mayDispatch({ channel, confidentiality, auditClassification }).permitted,
            `${channel}/${confidentiality}/${auditClassification} was refused`,
          ).toBe(true);
  });

  it('SENSITIVE_PII is permitted, deliberately — a statement must be able to reach its beneficiary', () => {
    // Asserted rather than left implicit, because the "obvious" hardening here breaks BR-505: a
    // beneficiary's own distribution statement is SENSITIVE_PII and reaching them is the point.
    // This function answers "is this a tipping-off disclosure", not "is this data sensitive".
    expect(
      mayDispatch({
        channel: 'NOTIFICATION',
        confidentiality: 'SENSITIVE_PII',
        auditClassification: 'SENSITIVE',
      }).permitted,
    ).toBe(true);
  });

  it('FAIL-CLOSED on every unknown, each with its own code', () => {
    expect(
      mayDispatch({
        channel: 'SMOKE_SIGNAL',
        confidentiality: 'NORMAL',
        auditClassification: 'ROUTINE',
      }),
    ).toMatchObject({ permitted: false, refusal: 'UNRECOGNISED_CHANNEL' });

    expect(
      mayDispatch({
        channel: 'NOTIFICATION',
        confidentiality: 'TOP_SECRET',
        auditClassification: 'ROUTINE',
      }),
    ).toMatchObject({ permitted: false, refusal: 'UNRECOGNISED_CONFIDENTIALITY' });

    expect(
      mayDispatch({
        channel: 'NOTIFICATION',
        confidentiality: 'NORMAL',
        auditClassification: 'EYES_ONLY',
      }),
    ).toMatchObject({ permitted: false, refusal: 'UNRECOGNISED_AUDIT_CLASSIFICATION' });

    // And the empty string, which is what an absent column reads as after a bad join.
    expect(
      mayDispatch({ channel: '', confidentiality: '', auditClassification: '' }).permitted,
    ).toBe(false);
  });

  it('an unknown CHANNEL is reported as such even when the payload is restricted', () => {
    // Ordering matters: if the restricted check ran first, a mis-typed channel carrying restricted
    // content would be refused for the RIGHT reason by accident, and a mis-typed channel carrying
    // ordinary content would be refused for no stated reason. The unknown must dominate.
    expect(
      mayDispatch({
        channel: 'SMOKE_SIGNAL',
        confidentiality: 'AML_RESTRICTED',
        auditClassification: 'RESTRICTED',
      }).refusal,
    ).toBe('UNRECOGNISED_CHANNEL');
  });

  it('AUDIT_FEED is deliberately NOT a channel', () => {
    // §09 rule 3 requires the AML action to BE logged, carrying RESTRICTED — not suppressed. Listing
    // the audit trail as an outbound channel would invite somebody to "protect" it by not writing
    // it, which is the one way to break the rule while appearing to honour it.
    expect(isOutboundChannel('AUDIT_FEED')).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · THE SOURCE CENSUS — rules 1 and 5 are NOT PROVEN, and this is what makes that honest
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Strip comments and string literals, so the census sees CODE.
 *
 * ⚠ **THIS EXISTS BECAUSE THE FIRST VERSION OF THIS CENSUS CRIED WOLF, AND THAT IS RECORDED RATHER
 * THAN QUIETLY FIXED.** A plain substring search for `notification.create` matched three places, and
 * measuring each one is what made the difference: two were PROSE (`audit.ts`'s comment explaining
 * which nested-write route the guard closes, and the same explanation in a test) and the third was a
 * real call — inside `nested-write-audit.integration.test.ts`, where it is an ATTACK PROBE asserting
 * that a nested write through an unaudited model is refused.
 *
 * None of the three is an outbound emission. A census that fails on all three is a census somebody
 * deletes in a fortnight, and its deletion would take the only mechanism guarding rules 1 and 5 with
 * it. So precision here is not fussiness — it is what makes the control survive its own first year.
 *
 * The stripper is crude, and its crudeness is PROVEN rather than assumed — see the controls below.
 */
function stripNonCode(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/**
 * Every hand-written TS/TSX file under `apps/` and `packages/`, comments and strings stripped.
 *
 * ⚠ TEST FILES ARE EXCLUDED, and that is the second lesson from the false positive. A test may
 * legitimately DRIVE the very thing production must not do — that is what an adversarial suite IS —
 * so a census treating an attack probe as a production emission cannot tell an attack from a breach.
 * Generated code is excluded too: the Prisma client's doc comments name every verb on every model,
 * which would make this census permanently and meaninglessly red.
 */
function handWrittenSources(): readonly { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const SKIP = new Set([
    'node_modules',
    'dist',
    '.turbo',
    '.next',
    'generated',
    'coverage',
    'test',
    '__tests__',
    'e2e',
  ]);

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry)) continue;
      out.push({
        path: full.slice(REPO_ROOT.length),
        text: stripNonCode(readFileSync(full, 'utf8')),
      });
    }
  };

  for (const root of ['apps', 'packages']) walk(join(REPO_ROOT, root));
  return out;
}

describe('the outbound universe is EMPTY, and this census is what notices when it stops being', () => {
  it('CONTROLS — the stripper really distinguishes code from prose', () => {
    // The census's precision is why it will still exist next sprint, so it is proven rather than
    // trusted. Every case below is a real shape the first version of this file got wrong.
    expect(stripNonCode('await prisma.notification.create({})')).toContain('notification.create');
    expect(stripNonCode('// notification.create({ data }) would be an emission')).not.toContain(
      'notification.create',
    );
    expect(stripNonCode('/* notification.create */ const x = 1;')).not.toContain(
      'notification.create',
    );
    expect(stripNonCode("const msg = 'notification.create';")).not.toContain('notification.create');
    expect(stripNonCode('const msg = `notification.create`;')).not.toContain('notification.create');
    // And it must not eat the code around what it strips.
    expect(stripNonCode('const a = 1; // note\nconst b = 2;')).toContain('const b = 2;');
  });

  it('the census can see the repository at all', () => {
    // Trustworthiness guard, and it is not decoration: this sprint measured twice (M10, M15) that
    // breaking a parser leaves the comparison it feeds passing VACUOUSLY. A census over zero files
    // would report an empty outbound universe forever, including after somebody built one.
    const sources = handWrittenSources();
    expect(sources.length).toBeGreaterThan(200);
    expect(sources.some((file) => file.path.includes('packages/domain/src/compliance/'))).toBe(
      true,
    );
    expect(sources.some((file) => file.path.includes('apps/web/src/'))).toBe(true);
    // And it must NOT be reading the generated client, whose doc comments mention every Prisma verb
    // on every model — including `notification.create`, which would make the next test always red.
    expect(sources.some((file) => file.path.includes('generated'))).toBe(false);
  });

  it.each(Object.keys(ABSENT_OUTBOUND_PATHS))(
    '`%s` still appears in NO hand-written source — the day it does, read this test',
    (marker) => {
      const hits = handWrittenSources()
        .filter((file) => file.text.includes(marker))
        // This module declares every marker as DATA and the stripper removes string literals, so it
        // should never trip its own census. Kept as a belt: the file whose job is to name the
        // markers must not be the file that reports them.
        .filter((file) => !file.path.includes('packages/domain/src/compliance/'))
        // `packages/jobs` IS the queue. Its own source naming its own class is not a wiring.
        .filter(
          (file) => !(marker === 'InMemoryJobQueue' && file.path.startsWith('packages/jobs/')),
        )
        .map((file) => file.path);

      expect(
        hits,
        `AN OUTBOUND PATH JUST APPEARED, and §09's no-tipping-off rules 1 and 5 are now REACHABLE ` +
          `in: ${hits.join(', ')}\n\n${ABSENT_OUTBOUND_PATHS[marker]}\n\n` +
          'This census exists to fail here rather than to let a pipeline ship past an unasked ' +
          'question. Route the new path through `mayDispatch()` in ' +
          'packages/domain/src/compliance/disclosure.ts, write the REAL negative test that is now ' +
          'possible (assert nothing was emitted, against a dispatcher that COULD have emitted), ' +
          'then delete this marker from ABSENT_OUTBOUND_PATHS. Do not delete this test to make it ' +
          'pass — a green build is not the deliverable, a proven rule is.',
      ).toEqual([]);
    },
  );

  it('no mail, SMS or push transport is a dependency of any workspace', () => {
    // The other way a pipeline arrives: not as code but as a dependency. Cheaper to catch here than
    // in a review, and it names the same remedy.
    const roots = ['apps', 'packages'];
    const found: string[] = [];
    for (const root of roots)
      for (const workspace of readdirSync(join(REPO_ROOT, root))) {
        const manifest = join(REPO_ROOT, root, workspace, 'package.json');
        let text: string;
        try {
          text = readFileSync(manifest, 'utf8');
        } catch {
          continue;
        }
        for (const dep of [
          'nodemailer',
          'sendgrid',
          'resend',
          'twilio',
          'firebase-admin',
          'web-push',
        ])
          if (text.includes(`"${dep}`) || text.includes(`/${dep}"`))
            found.push(`${root}/${workspace} -> ${dep}`);
      }

    expect(
      found,
      `A TRANSPORT DEPENDENCY APPEARED: ${found.join(', ')}. §09 rule 1 says the AML compartment ` +
        'emits nothing into the general notification pipeline — which was trivially true while no ' +
        'transport existed. It is now a rule somebody has to enforce: route every send through ' +
        '`mayDispatch()` and write the negative test that is finally capable of failing.',
    ).toEqual([]);
  });

  it('records, as a TEST rather than a comment, WHICH of rules 1 and 5 are still unproven', () => {
    // The honest statement, pinned where a reader looking for the G-6 evidence will find it. If
    // somebody later claims rules 1 and 5 are green while the paths below are still absent, this
    // assertion is the contradiction.
    //
    // ⊕ THREE → TWO IN S9-3d (2026-08-27), and this is the census working rather than the census
    // being edited to pass. `notification.create` is gone because that path now EXISTS, is gated by
    // `mayDispatch` on row creation (an in-app row addressed to a user IS an egress to that user —
    // the scoping extension narrows `Notification` by `userId`), and carries the REAL negative test
    // this file's failure message demanded: a SAR-subject duty emitting nothing BESIDE a positive
    // control that emits, same dispatcher, same run
    // (`packages/api/test/no-tipping-off-dispatch.integration.test.ts`).
    //
    // The other two STAY, and neither is an oversight:
    //  · `InMemoryJobQueue` — the evaluator's decisions and gate shipped, the SCHEDULE did not.
    //    `apps/worker` cannot call a maker procedure (no grant; a SYSTEM actor holds none), and both
    //    ways round that are decisions above engineering's line — a standing service seat in the
    //    access matrix, or a write path below the procedure ladder. Routed, not chosen; E9's, which
    //    is what the worker file's own header says.
    //  · `AuditAction.EXPORT` — no export or evidence-pack surface exists at all.
    //
    // So G-6 clause 2 is MEASURED for the notification/escalation channel and STILL BOUNDED for
    // export. Anyone quoting it must say which.
    expect(Object.keys(ABSENT_OUTBOUND_PATHS).length).toBeGreaterThan(0);
    expect(
      Object.keys(ABSENT_OUTBOUND_PATHS).sort(),
      'the set of absent outbound paths changed — G-6 rules 1 and 5 may now be provable, or may ' +
        'have quietly stopped being tracked',
    ).toEqual(['AuditAction.EXPORT', 'InMemoryJobQueue']);
  });
});
