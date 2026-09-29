import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isDomainError, type DomainError } from '../errors.js';
import { ROUNDING_METHODS } from '../money.js';
import {
  LEGACY_SETTING_KEYS,
  SETTING_KEYS,
  SETTING_SCHEMAS,
  SETTING_SCOPE_ORDER,
  UNVERIFIED_FIGURE_KEYS,
  UNVERIFIED_NOTE,
  WEEKDAY_CODES,
  isSettingKey,
  parseSetting,
  pickMostSpecific,
  settingEnvelopeSchema,
  settingScopeOrder,
  type SettingKey,
} from '../settings.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * BINDING RULE 3 — the staleness rule — is what this file guards.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Every numeric threshold, statutory deadline, fee percentage and classification band in the
 * repo is UNVERIFIED until confirmed against primary Saudi law. None of them is a code
 * constant: each lives in a `Setting` row, so a correction is a CONFIG change. This file
 * proves (a) the vocabulary the engines will accept, and (b) that the caveat travels WITH the
 * value — an unverified figure without its "⚠ unverified" marker does not parse.
 *
 * The seed is read as TEXT, not imported: `packages/domain` imports nothing internal, and
 * `database → domain` already exists so an import here would be a cycle. Same technique the
 * role-parity test uses on `schema.prisma`. The point is that TWO SIDES ARE COMPARED — the
 * seeded key set and this schema registry — because Sprint 1's holes both existed where
 * nothing compared two sides that were supposed to agree.
 */

function caught(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error: unknown) {
    return error;
  }
}

function expectDomainCode(fn: () => unknown, code: string): void {
  const error = caught(fn);
  expect(isDomainError(error), `expected DomainError(${code}), got: ${String(error)}`).toBe(true);
  expect((error as DomainError).code).toBe(code);
}

function readRepoFile(relativeToThisFile: string): string {
  return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), 'utf8');
}

interface SeededSetting {
  readonly key: string;
  readonly v: unknown;
  readonly unit: string | null;
  readonly unverified: boolean;
}

/**
 * Scan `packages/database/src/seed/settings.ts` for its `setting('<key>', { … })` calls.
 *
 * Deliberately a text scan of the three fields that matter (`v`, `unit`, `unverified`) — each
 * of which the seed writes on ONE line — rather than an import. `source` is skipped: it is
 * free prose (sometimes concatenated across lines) and its schema only requires non-emptiness.
 */
function scanSeededSettings(): SeededSetting[] {
  const lines = readRepoFile('../../../database/src/seed/settings.ts').split('\n');
  const found: SeededSetting[] = [];

  let key: string | undefined;
  let v: unknown;
  let unit: string | null | undefined;
  let unverified: boolean | undefined;

  const literal = (raw: string): unknown =>
    JSON.parse(raw.trim().replace(/,$/, '').replace(/'/g, '"')) as unknown;

  for (const line of lines) {
    // Two call shapes in the seed: `setting('key', {` on one line, and `setting(` / `'key',`
    // / `{` across three (the per-waqf override, which takes a third argument).
    const keyMatch = /^\s*(?:setting\(\s*)?'([A-Za-z][A-Za-z0-9._]*)',\s*\{?\s*$/.exec(line);
    if (keyMatch !== null && (line.includes('setting(') || key === undefined)) {
      key = keyMatch[1];
      v = undefined;
      unit = undefined;
      unverified = undefined;
      continue;
    }
    if (key === undefined) continue;

    const vMatch = /^\s*v:\s*(.+),\s*$/.exec(line);
    if (vMatch !== null) {
      v = literal(vMatch[1] ?? '');
      continue;
    }
    const unitMatch = /^\s*unit:\s*(.+),\s*$/.exec(line);
    if (unitMatch !== null) {
      const raw = (unitMatch[1] ?? '').trim();
      unit = raw === 'null' ? null : (literal(raw) as string);
      continue;
    }
    const unverifiedMatch = /^\s*unverified:\s*(true|false),\s*$/.exec(line);
    if (unverifiedMatch !== null) {
      unverified = unverifiedMatch[1] === 'true';
      // `unverified` is the last of the three in every seeded block, so the record is complete.
      if (v !== undefined && unit !== undefined) {
        found.push({ key, v, unit, unverified });
        key = undefined;
      }
      continue;
    }
  }
  return found;
}

/** Canonicalise a seeded key through the declared legacy-key map. */
function canonicalKey(key: string): SettingKey | undefined {
  if (isSettingKey(key)) return key;
  const mapped = LEGACY_SETTING_KEYS[key];
  return mapped;
}

const seeded = scanSeededSettings();

describe('the seed scan itself is trustworthy', () => {
  // A silently-empty scan would make every assertion below vacuous — the exact failure mode
  // that lets a parity test pass while proving nothing.
  it('found the seeded settings', () => {
    expect(seeded.length).toBeGreaterThanOrEqual(14);
    expect(seeded.map((row) => row.key)).toContain('classification.threshold.large.sar');
    expect(seeded.map((row) => row.key)).toContain('calendar.workweek');
  });
});

describe('the UNVERIFIED marker is byte-identical across packages', () => {
  it('matches the constant the seed builder stamps on every unverified row', () => {
    const seedSource = readRepoFile('../../../database/src/seed/settings.ts');
    const match = /export const UNVERIFIED_NOTE = '([^']+)';/.exec(seedSource);
    expect(match, 'could not find UNVERIFIED_NOTE in the seed').not.toBeNull();
    expect(UNVERIFIED_NOTE).toBe(match?.[1]);
    // The marker is user-visible text that travels into reports and exports. Pin it literally
    // too: a "harmless" rewording in either package would silently break the comparison above.
    expect(UNVERIFIED_NOTE).toBe('⚠ unverified — confirm vs primary law');
  });
});

describe('every seeded key is a registered Setting key, and every seeded value parses', () => {
  it('the seeded key set is covered by SETTING_SCHEMAS (or a DECLARED legacy key)', () => {
    const unregistered = seeded
      .map((row) => row.key)
      .filter((key) => canonicalKey(key) === undefined);
    expect(unregistered).toEqual([]);
  });

  it('every registered key is exercised by the seed', () => {
    // The other direction: a schema for a key nothing seeds is a vocabulary nobody uses.
    const seededCanonical = new Set(seeded.map((row) => canonicalKey(row.key)));
    expect([...SETTING_KEYS].filter((key) => !seededCanonical.has(key))).toEqual([]);
  });

  it.each(seeded.map((row) => [row.key, row] as const))(
    '%s parses against its schema',
    (_key, row) => {
      const key = canonicalKey(row.key);
      expect(key).not.toBeUndefined();
      const envelope = {
        v: row.v,
        unit: row.unit,
        unverified: row.unverified,
        source: 'seed (scanned in test)',
        ...(row.unverified ? { note: UNVERIFIED_NOTE } : {}),
      };
      expect(() => parseSetting(key as SettingKey, envelope)).not.toThrow();
    },
  );

  /**
   * BINDING RULE 3, asserted against the data. Every figure that is a regulatory threshold,
   * deadline, fee percentage or classification band must be seeded `unverified: true` and
   * therefore carry the marker. Flipping one to `false` is a claim that primary Saudi law +
   * counsel confirmed it — this test forces that claim to be made HERE, deliberately, rather
   * than in a config edit nobody reviews.
   */
  it('every unverified-figure key is seeded unverified, and nothing else is', () => {
    const seededUnverified = new Set(
      seeded.filter((row) => row.unverified).map((row) => canonicalKey(row.key)),
    );
    expect(seededUnverified).toEqual(new Set(UNVERIFIED_FIGURE_KEYS));

    // The complement, named so a reader can see WHY each one is exempt.
    const verified = seeded.filter((row) => !row.unverified).map((row) => canonicalKey(row.key));
    expect(new Set(verified)).toEqual(
      new Set([
        'nazirFee.basis.default', // CONTRACTUAL: fixed by the deed, no primary-law figure to verify
        'distribution.rounding.unitMinor', // arithmetic granularity: SAR's minor unit is 1/100
        'calendar.workweek', // an operating fact, not a statutory figure
        // OUR OWN security policy (NFR-06 / §15), not a figure quoted from primary Saudi law.
        // Configurable because operations will tune it, not because counsel has yet to confirm it.
        'auth.totpStepUp.freshnessSeconds',
        // S9-2, Engine B: QMULATE's OWN alerting policy — when we start acting before a recorded
        // expiry, and when we remind. The statutory facts are the expiries/due dates themselves;
        // these four are exempt for the same reason as the security window above.
        'deadline.LICENSE_RENEWAL.preExpiryLeadBd',
        'deadline.CONTRACT_RENEWAL.preExpiryLeadBd',
        'deadline.preAlertOffsetsBd',
        'deadline.atRiskThresholdBd',
        // S9-3c, Engine B: how many business days before a recorded `Waqf.certificateExpiry` the
        // daily sweep raises `GOV-REG-02` — §09's own parenthesis, "on (or a configurable lead
        // before) expiry". ⚠ EXEMPT FOR A PRECISE REASON, not by family resemblance: this figure
        // moves WHEN WE NOTICE, never the anchor. §09's rule table fixes the 15-business-day
        // window at the certificate-expiry date, and the api suite pins that a sweep noticing a
        // month early and one noticing on the day compute the SAME due date. A figure that could
        // move a statutory deadline would belong in UNVERIFIED_FIGURE_KEYS instead.
        'deadline.UPDATE_15BD.certificateExpiryLeadBd',
        // S9-3d, Engine B: the BR-1004 ladder thresholds, both classes. The PATH is fixed
        // vocabulary in code; only WHEN each rung engages is policy, and nothing in primary law
        // says when QMULATE escalates internally. ⚠ The RELATION between the two ladders IS
        // structural and is asserted in `selectEscalationLadder` — a zero-tolerance rung slower
        // than the ordinary one refuses rather than being accepted as configuration.
        'deadline.escalationLadderBd',
        'deadline.escalationLadderZeroToleranceBd',
      ]),
    );
  });

  /**
   * EXIT-3 is BROKEN BY DATA today: the seeded global key is `nazirFee.percentOfRevenue.default`
   * while the seeded per-waqf override is `nazirFee.percentOfRevenue` — two different keys with
   * no fallback link, so the endowment override can never win. This test names the drift rather
   * than absorbing it; the seed-side rename belongs to whoever owns the seed.
   */
  it('names the nazirFee key drift explicitly while it exists', () => {
    const seededKeys = new Set(seeded.map((row) => row.key));
    const drifted = Object.keys(LEGACY_SETTING_KEYS).filter((key) => seededKeys.has(key));
    if (drifted.length > 0) {
      expect(drifted).toEqual(['nazirFee.percentOfRevenue.default']);
      expect(LEGACY_SETTING_KEYS['nazirFee.percentOfRevenue.default']).toBe(
        'nazirFee.percentOfRevenue',
      );
    } else {
      // The rename landed: LEGACY_SETTING_KEYS should now be deleted.
      expect(seededKeys.has('nazirFee.percentOfRevenue')).toBe(true);
    }
  });
});

describe('settingEnvelopeSchema mirrors the shipped seed refinement exactly', () => {
  const base = { v: 10, unit: 'percent', source: 'test' };

  it('an unverified envelope MUST carry the marker note', () => {
    expect(
      settingEnvelopeSchema.safeParse({ ...base, unverified: true, note: UNVERIFIED_NOTE }).success,
    ).toBe(true);
    expect(settingEnvelopeSchema.safeParse({ ...base, unverified: true }).success).toBe(false);
    expect(
      settingEnvelopeSchema.safeParse({ ...base, unverified: true, note: 'probably fine' }).success,
    ).toBe(false);
    expect(settingEnvelopeSchema.safeParse({ ...base, unverified: true, note: '' }).success).toBe(
      false,
    );
  });

  it('a verified envelope MUST carry no note at all', () => {
    expect(settingEnvelopeSchema.safeParse({ ...base, unverified: false }).success).toBe(true);
    expect(
      settingEnvelopeSchema.safeParse({ ...base, unverified: false, note: UNVERIFIED_NOTE })
        .success,
    ).toBe(false);
  });

  it('rejects an envelope that carries no value at all', () => {
    // `z.unknown()` is optional in zod, so this is a real fail-open risk in the structural floor.
    expect(
      settingEnvelopeSchema.safeParse({ unit: null, unverified: false, source: 'test' }).success,
    ).toBe(false);
    expect(
      settingEnvelopeSchema.safeParse({
        v: undefined,
        unit: null,
        unverified: false,
        source: 'test',
      }).success,
    ).toBe(false);
    // A legitimately falsy value is still a value.
    expect(
      settingEnvelopeSchema.safeParse({ v: 0, unit: null, unverified: false, source: 'test' })
        .success,
    ).toBe(true);
    expect(
      settingEnvelopeSchema.safeParse({ v: false, unit: null, unverified: false, source: 'test' })
        .success,
    ).toBe(true);
  });

  it('rejects unknown fields, a missing source, and a missing unit', () => {
    expect(settingEnvelopeSchema.safeParse({ ...base, unverified: false, extra: 1 }).success).toBe(
      false,
    );
    expect(settingEnvelopeSchema.safeParse({ v: 10, unit: null, unverified: false }).success).toBe(
      false,
    );
    expect(
      settingEnvelopeSchema.safeParse({ v: 10, unit: null, unverified: false, source: '' }).success,
    ).toBe(false);
    expect(
      settingEnvelopeSchema.safeParse({ v: 10, unverified: false, source: 'test' }).success,
    ).toBe(false);
  });
});

describe('parseSetting fails closed', () => {
  it('throws SETTING_MISSING for a key that is not in the registry', () => {
    expectDomainCode(() => parseSetting('not.a.key' as SettingKey, {}), 'SETTING_MISSING');
    expectDomainCode(() => parseSetting(null as unknown as SettingKey, {}), 'SETTING_MISSING');
  });

  it('throws SETTING_INVALID when a row exists but its value is the wrong shape', () => {
    expectDomainCode(
      () =>
        parseSetting('deadline.REGISTER_30BD.businessDays', {
          v: 'thirty',
          unit: 'business_days',
          unverified: true,
          source: 'test',
          note: UNVERIFIED_NOTE,
        }),
      'SETTING_INVALID',
    );
  });

  /**
   * MONEY-VALUED SETTINGS ARE STRINGS. A JS `number` is never money: binary floats cannot hold
   * halalas exactly, and a classification band decides which statutory obligations apply.
   */
  it('refuses a JS number for a money-valued band, and demands the halala scale', () => {
    const envelope = (v: unknown) => ({
      v,
      unit: 'SAR',
      unverified: true,
      source: 'test',
      note: UNVERIFIED_NOTE,
    });
    expect(() =>
      parseSetting('classification.threshold.large.sar', envelope('200000000.00')),
    ).not.toThrow();
    expectDomainCode(
      () => parseSetting('classification.threshold.large.sar', envelope(200000000)),
      'SETTING_INVALID',
    );
    expectDomainCode(
      () => parseSetting('classification.threshold.large.sar', envelope('200000000.005')),
      'SETTING_INVALID',
    );
    expectDomainCode(
      () => parseSetting('classification.threshold.large.sar', envelope('2e8')),
      'SETTING_INVALID',
    );
    expectDomainCode(
      () => parseSetting('classification.threshold.large.sar', envelope('-1.00')),
      'SETTING_INVALID',
    );
  });

  it('pins the unit, so a figure cannot silently change what it measures', () => {
    expectDomainCode(
      () =>
        parseSetting('classification.threshold.large.sar', {
          v: '200000000.00',
          unit: 'USD',
          unverified: true,
          source: 'test',
          note: UNVERIFIED_NOTE,
        }),
      'SETTING_INVALID',
    );
  });

  it('refuses a negative or fractional deadline window', () => {
    const envelope = (v: unknown) => ({
      v,
      unit: 'business_days',
      unverified: true,
      source: 'test',
      note: UNVERIFIED_NOTE,
    });
    expectDomainCode(
      () => parseSetting('deadline.UPDATE_15BD.businessDays', envelope(-1)),
      'SETTING_INVALID',
    );
    expectDomainCode(
      () => parseSetting('deadline.UPDATE_15BD.businessDays', envelope(1.5)),
      'SETTING_INVALID',
    );
  });

  it('refuses a workweek that is empty, duplicated, or not a weekday code', () => {
    const envelope = (v: unknown) => ({ v, unit: null, unverified: false, source: 'test' });
    expect(() => parseSetting('calendar.workweek', envelope(['SUN', 'MON']))).not.toThrow();
    expectDomainCode(() => parseSetting('calendar.workweek', envelope([])), 'SETTING_INVALID');
    expectDomainCode(
      () => parseSetting('calendar.workweek', envelope(['SUN', 'SUN'])),
      'SETTING_INVALID',
    );
    expectDomainCode(
      () => parseSetting('calendar.workweek', envelope(['Sunday'])),
      'SETTING_INVALID',
    );
    expectDomainCode(() => parseSetting('calendar.workweek', envelope('SUN')), 'SETTING_INVALID');
  });

  it('refuses a rounding method the money engine does not implement', () => {
    const envelope = (v: unknown) => ({
      v,
      unit: null,
      unverified: true,
      source: 'test',
      note: UNVERIFIED_NOTE,
    });
    expect(() =>
      parseSetting('distribution.rounding.method', envelope('LARGEST_REMAINDER_HALF_UP')),
    ).not.toThrow();
    expectDomainCode(
      () => parseSetting('distribution.rounding.method', envelope('ROUND_DOWN')),
      'SETTING_INVALID',
    );
  });
});

describe('enums are compared against the other side that must agree', () => {
  /** The fee-basis vocabulary is the Prisma `FeeBasis` enum; read it rather than restate it. */
  it('nazirFee.basis.default accepts exactly schema.prisma’s FeeBasis values', () => {
    const schema = readRepoFile('../../../database/prisma/schema.prisma');
    const block = /\benum\s+FeeBasis\s*\{([^}]*)\}/.exec(schema);
    expect(block, 'could not find `enum FeeBasis` in schema.prisma').not.toBeNull();
    const values = (block?.[1] ?? '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z][A-Z_]*$/.test(line));

    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(() =>
        parseSetting('nazirFee.basis.default', {
          v: value,
          unit: null,
          unverified: false,
          source: 'test',
        }),
      ).not.toThrow();
    }
    expectDomainCode(
      () =>
        parseSetting('nazirFee.basis.default', {
          v: 'PERCENT_OF_GROSS_VIBES',
          unit: null,
          unverified: false,
          source: 'test',
        }),
      'SETTING_INVALID',
    );
  });

  /** The rounding-method vocabulary is the money engine's, not a second list. */
  it('distribution.rounding.method accepts exactly the money engine’s ROUNDING_METHODS', () => {
    for (const method of ROUNDING_METHODS) {
      expect(() =>
        parseSetting('distribution.rounding.method', {
          v: method,
          unit: null,
          unverified: true,
          source: 'test',
          note: UNVERIFIED_NOTE,
        }),
      ).not.toThrow();
    }
  });

  it('WEEKDAY_CODES covers the seven days once each', () => {
    expect(WEEKDAY_CODES).toEqual(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
    expect(new Set(WEEKDAY_CODES).size).toBe(7);
  });

  /**
   * The date engine keeps its own weekday list (indexed by weekday number, `@internal`). Two
   * lists that must agree about which day is Friday, with nothing comparing them, is the
   * Sprint-1 failure mode in miniature — and getting it wrong would move every KSA weekend and
   * therefore every statutory due date. Read the engine's list as text and compare, in order.
   */
  it('agrees, in order, with the date engine’s weekday list', () => {
    const civilDateSource = readRepoFile('../dates/civil-date.ts');
    const block = /WEEKDAY_CODES[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/.exec(civilDateSource);
    expect(block, 'could not find WEEKDAY_CODES in src/dates/civil-date.ts').not.toBeNull();
    const engineCodes = [...(block?.[1] ?? '').matchAll(/'([A-Z]{3})'/g)].map((match) => match[1]);
    expect(engineCodes).toEqual([...WEEKDAY_CODES]);
  });
});

describe('scope resolution is endowment-before-global', () => {
  it('settingScopeOrder puts the endowment tier first', () => {
    expect(settingScopeOrder()).toEqual(['endowment', 'global']);
    expect(SETTING_SCOPE_ORDER).toEqual(['endowment', 'global']);
  });

  it('pickMostSpecific returns the endowment override over the global default', () => {
    expect(
      pickMostSpecific('nazirFee.percentOfRevenue', [
        { tier: 'global', value: 'global-value' },
        { tier: 'endowment', value: 'endowment-value' },
      ]),
    ).toBe('endowment-value');
  });

  it('falls back to global when there is no endowment row', () => {
    expect(
      pickMostSpecific('nazirFee.percentOfRevenue', [{ tier: 'global', value: 'global-value' }]),
    ).toBe('global-value');
  });

  it('throws SETTING_MISSING when no tier has a row — never a silent default', () => {
    expectDomainCode(() => pickMostSpecific('retention.minimumYears', []), 'SETTING_MISSING');
  });

  it('throws on an unmapped tier rather than treating it as global', () => {
    expectDomainCode(
      () =>
        pickMostSpecific('retention.minimumYears', [
          { tier: 'client' as unknown as 'global', value: 'x' },
        ]),
      'SETTING_INVALID',
    );
  });
});

describe('the registry is closed', () => {
  it('isSettingKey narrows and refuses near-misses', () => {
    expect(isSettingKey('retention.minimumYears')).toBe(true);
    for (const junk of [
      'retention.minimumYears ',
      'RETENTION.MINIMUMYEARS',
      '',
      null,
      undefined,
      7,
    ]) {
      expect(isSettingKey(junk)).toBe(false);
    }
  });

  it('SETTING_KEYS and SETTING_SCHEMAS describe the same set', () => {
    expect(new Set(SETTING_KEYS)).toEqual(new Set(Object.keys(SETTING_SCHEMAS)));
  });

  /**
   * D-1: there is deliberately NO "leadership authority matrix" Setting — not even one
   * defaulting to the empty set. An empty configurable is a foothold for a second approval
   * authority; if it is ever wanted it becomes a deliberate future change with an ADR.
   */
  it('models no leadership authority matrix', () => {
    for (const key of SETTING_KEYS) {
      expect(key.toLowerCase()).not.toContain('leadership');
      expect(key.toLowerCase()).not.toContain('authoritymatrix');
    }
  });
});
