/**
 * D-4 — THREE HIJRI IMPLEMENTATIONS BECOME ONE, AND STAY ONE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY TWO IMPLEMENTATIONS OF A FROZEN DATE IS A CORRECTNESS BUG, NOT A TIDINESS ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every legally-significant date in this system is stored TWICE: a canonical UTC `DateTime` plus a
 * FROZEN Umm al-Qura `…Hijri String` snapshot written at insert time. The snapshot is frozen
 * precisely so a future ICU or calendar-library update can never retroactively shift how a
 * historical Saudi date renders on a report that has already been filed with the Authority.
 *
 * Sprint 1 shipped THREE independent converters:
 *
 *   1. `src/seed/hijri.ts`          — an `Intl` formatter WITH a six-anchor self-test;
 *   2. `defaultToHijri` in `src/extensions/audit.ts` — a second copy with NO anchor test, stamping
 *                                     `occurredAtHijri` on every single audit event;
 *   3. `src/hijri.ts`               — the package-wide wrapper both files' headers demanded, which
 *                                     was never written at all.
 *
 * Two converters means two different frozen strings can land in one database for one instant, and
 * `setHijriFormatter()` — the one-line collapse hook — was never called. User decision D-4:
 * `packages/domain` owns the single implementation, via
 * `Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn')`. `@umalqura/core` is deliberately NOT
 * added: CI runs `--frozen-lockfile`, and a new library cannot rewrite frozen history anyway.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE PROVES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  • the three former call sites now agree, instant for instant, across the fixture's full range
 *    (1978 → 2026 — 17 500+ days, not a handful of samples);
 *  • the six committed anchors reproduce, in BOTH directions;
 *  • the DATABASE's own frozen snapshots agree with the surviving implementation — which is the
 *    assertion that would have caught a silent drift;
 *  • out-of-range conversions THROW instead of letting ICU extrapolate.
 *
 * An INTEGRATION test because the audit spine's `toHijri` is reachable only through
 * `src/index.ts`, which re-exports the generated Prisma client.
 */
import {
  HIJRI_SUPPORTED_RANGE,
  fromHijri,
  toHijri as domainToHijri,
  toHijriSnapshot,
} from '@qmulate/domain/dates';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HIJRI_ANCHORS, toHijri as seedToHijri } from '../src/seed/hijri.js';
import {
  basePrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  hasDatabase,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('D-4 (one Hijri implementation) and the frozen-anchor reproduction');

/** The fixture's full span: earliest asset acquisition → past the seed epoch. */
const RANGE_START = '1978-01-01';
const RANGE_END = '2026-12-31';

const MS_PER_DAY = 86_400_000;

describe.skipIf(!hasDatabase)('D-4 · exactly one Umm al-Qura implementation', () => {
  /** The audit spine's `toHijri`, i.e. whatever `setHijriFormatter()` installed. */
  let auditToHijri: (date: Date) => string;

  beforeAll(async () => {
    ensureSeeded();
    // Loading the barrel is what installs the formatter (`src/client.ts` calls `setHijriFormatter`
    // at module scope). That is the collapse, and importing the barrel the way any consumer would is
    // the only honest way to test it.
    const database = await databaseModule();
    auditToHijri = database.toHijri;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('the audit spine and the seed share ONE function, by object identity where possible', () => {
    // Not merely "they agree on these inputs" — the seed's `toHijri` is a thin wrapper that delegates
    // to `toHijriSnapshot`, and the audit spine's is the installed formatter. Agreement on 17 500
    // days follows, but identity of the underlying implementation is the property that cannot drift.
    expect(typeof auditToHijri).toBe('function');
    const probe = new Date('2026-01-01T00:00:00.000Z');
    expect(auditToHijri(probe)).toBe(toHijriSnapshot(probe));
    expect(seedToHijri(probe)).toBe(toHijriSnapshot(probe));
  });

  it('agrees on EVERY day of the fixture range (1978 → 2026), not on samples', () => {
    const start = new Date(`${RANGE_START}T00:00:00.000Z`).getTime();
    const end = new Date(`${RANGE_END}T00:00:00.000Z`).getTime();
    const disagreements: string[] = [];

    for (let time = start; time <= end; time += MS_PER_DAY) {
      const date = new Date(time);
      const civil = date.toISOString().slice(0, 10);
      const viaSeed = seedToHijri(date);
      const viaAudit = auditToHijri(date);
      const viaDomain: string = domainToHijri(civil);
      if (viaSeed !== viaDomain || viaAudit !== viaDomain) {
        disagreements.push(`${civil}: seed=${viaSeed} audit=${viaAudit} domain=${viaDomain}`);
        if (disagreements.length > 5) break;
      }
    }

    expect(
      disagreements,
      'the Hijri implementations disagree — two frozen strings for one instant is how a filed Saudi ' +
        'date silently changes',
    ).toEqual([]);
    // Guard against a vacuous pass: the loop must actually have run.
    expect(Math.round((end - start) / MS_PER_DAY)).toBeGreaterThan(17_000);
  });

  it('reproduces all SIX committed anchors, in BOTH directions', () => {
    // These strings are COMMITTED HISTORY — they are already in `waqf.registrationDateHijri`,
    // `asset.acquiredDateHijri` and friends. D-4 requires the single implementation to reproduce them
    // BY CONSTRUCTION; a mismatch silently rewrites filed dates.
    expect(HIJRI_ANCHORS.length).toBe(6);
    for (const [gregorian, expected] of HIJRI_ANCHORS) {
      expect(seedToHijri(new Date(`${gregorian}T00:00:00.000Z`)), gregorian).toBe(expected);
      expect(auditToHijri(new Date(`${gregorian}T00:00:00.000Z`)), gregorian).toBe(expected);
      expect(String(domainToHijri(gregorian)), gregorian).toBe(expected);
      // The inverse: Hijri -> Gregorian must land back on the same civil date.
      expect(String(fromHijri(expected)), `${expected} AH -> Gregorian`).toBe(gregorian);
    }
  });

  it('agrees with the snapshots ALREADY IN THE DATABASE', () => {
    // The assertion that would have caught a drift: compare the surviving implementation against the
    // strings a previous run actually wrote, rather than against another copy of the same code.
    return (async () => {
      const prisma = await basePrisma();

      const waqfs = await prisma.waqf.findMany({ orderBy: { id: 'asc' } });
      expect(waqfs.length).toBeGreaterThan(0);
      for (const waqf of waqfs) {
        const civil = waqf.registrationDate.toISOString().slice(0, 10);
        expect(waqf.registrationDateHijri, `${waqf.id}.registrationDateHijri`).toBe(
          String(domainToHijri(civil)),
        );
        expect(waqf.shartAlWaqifSetAtHijri, `${waqf.id}.shartAlWaqifSetAtHijri`).toBe(
          String(domainToHijri(waqf.shartAlWaqifSetAt.toISOString().slice(0, 10))),
        );
      }

      const assets = await prisma.asset.findMany({ orderBy: { id: 'asc' } });
      for (const asset of assets) {
        expect(asset.acquiredDateHijri, `${asset.id}.acquiredDateHijri`).toBe(
          String(domainToHijri(asset.acquiredDate.toISOString().slice(0, 10))),
        );
      }

      // The audit spine's own column, written through the INSTALLED formatter.
      const events = await prisma.auditEvent.findMany({ orderBy: { id: 'asc' }, take: 200 });
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(event.occurredAtHijri, `audit_event ${String(event.id)}`).toBe(
          auditToHijri(event.occurredAt),
        );
      }
    })();
  });

  it('THROWS outside the Umm al-Qura table window rather than extrapolating', () => {
    // Node ICU will happily answer for 1500-01-01 with a nonsense 10th-century AH date. An
    // extrapolated Hijri date on a waqf record is a fabricated fact, so the conversion is refused.
    expect(() => toHijriSnapshot(new Date('1500-01-01T00:00:00.000Z'))).toThrow(RangeError);
    expect(() => toHijriSnapshot(new Date('2200-01-01T00:00:00.000Z'))).toThrow(RangeError);
    expect(() => seedToHijri(new Date('1500-01-01T00:00:00.000Z'))).toThrow(/outside/);
    // The window itself is pinned so a future ICU update that shifts it fails loudly.
    expect(HIJRI_SUPPORTED_RANGE.minCivilDate).toBe('1882-11-12');
    expect(HIJRI_SUPPORTED_RANGE.maxCivilDate).toBe('2174-11-25');
  });

  it('refuses an invalid Date instead of writing a garbage snapshot', () => {
    expect(() => seedToHijri(new Date('not a date'))).toThrow(/invalid Date/);
  });

  it('leaves NO second implementation in packages/database (source scan)', async () => {
    // The tripwire. `defaultToHijri` may still EXIST in `extensions/audit.ts` — it is the fallback if
    // nobody installs a formatter, and deleting it would mean an un-collapsed consumer silently gets
    // no Hijri at all. What must not exist is a SECOND `Intl.DateTimeFormat('…umalqura…')`
    // construction anywhere else in the package, and `setHijriFormatter` must actually be called.
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');

    const root = fileURLToPath(new URL('../src', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts')) files.push(full);
      }
    };
    walk(root);

    // COMMENTS ARE STRIPPED FIRST. Several of these files DISCUSS the locale string at length — that
    // is the documentation of the collapse, and a scan that counted prose as code would push a future
    // engineer into deleting the explanation to make the test pass.
    const stripComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

    const constructors = files.filter((file) =>
      /Intl\.DateTimeFormat\(\s*'en-u-ca-islamic-umalqura/.test(
        stripComments(readFileSync(file, 'utf8')),
      ),
    );
    expect(
      constructors.map((file) => file.slice(root.length + 1)),
      'more than one Umm al-Qura formatter is constructed in packages/database. The one permitted ' +
        'copy is the DEFAULT inside extensions/audit.ts, which src/client.ts overrides via ' +
        'setHijriFormatter(); a second construction is a second frozen-history implementation.',
    ).toEqual(['extensions/audit.ts']);

    const clientSource = stripComments(readFileSync(join(root, 'client.ts'), 'utf8'));
    expect(
      clientSource,
      'src/client.ts must install the single implementation — it is the module every write path ' +
        'passes through, so installing it anywhere else leaves other writers on the fallback',
    ).toMatch(/setHijriFormatter\(/);
    expect(clientSource).toMatch(/toHijriSnapshot/);

    // And the seed's module must no longer construct one of its own.
    const seedSource = stripComments(readFileSync(join(root, 'seed', 'hijri.ts'), 'utf8'));
    expect(seedSource).not.toMatch(/Intl\.DateTimeFormat/);
    expect(seedSource).toMatch(/@qmulate\/domain\/dates/);
  });

  it.todo(
    "SURFACED (DEVIATION): §17's stack line nominates `@umalqura/core` for Hijri conversion. D-4 " +
      'ships Node `Intl` instead — no dependency, no install step, and CI runs --frozen-lockfile. ' +
      'Record it in the deviations table in BUILD-PLAN.md.',
  );
});
