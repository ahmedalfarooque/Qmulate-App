// QMULATE — unit tests for the audit hash chain (NFR-04, gate G-1, assertions A6/A7).
//
// NO DATABASE. Canonicalization and hashing are pure functions, and they are the part of G-1 that
// must be pinned hardest: if the encoding drifts by one byte, every historical `rowHash` stops
// recomputing and the trail becomes unverifiable — silently, and only at the moment somebody
// finally tries to audit it.
//
// The FROZEN VECTORS below were produced by executing `src/hash-chain.ts` itself. They are not
// aspirational values: they are what the shipped code emits today. Changing the canonical encoding
// will break them, which is the entire point — a change to this encoding is a breaking change to
// every audit trail already written, and it must never happen by accident.

import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  AUDIT_HASH_PAYLOAD_FIELDS,
  CanonicalJsonError,
  GENESIS_HASH,
  HASH_HEX_RE,
  buildAuditPayload,
  canonicalJson,
  computeHash,
  dateToCanonicalString,
  decimalToCanonicalString,
  numberToCanonicalString,
  recomputeRowHash,
  serializeForAudit,
  verifyChain,
  type AuditHashRow,
} from '../src/hash-chain.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Frozen vectors
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Deliberately contains one of everything the encoder has a rule for: unsorted keys, a nested
 * object with unsorted keys, an explicit `null`, an `undefined` (must vanish, not become null),
 * a Decimal with fewer than 2 dp and one with 4, a BigInt beyond `Number.MAX_SAFE_INTEGER`, a
 * Date, an ordered array, and an Arabic/RTL string with an em dash.
 */
const FROZEN_INPUT = {
  zebra: 'last',
  alpha: 'first',
  nested: { b: true, a: null },
  amount: new Decimal('350000'),
  share: new Decimal('12.3456'),
  big: BigInt('9007199254740993'),
  when: new Date('2026-01-01T00:00:00.000Z'),
  rtl: 'وقف — الطبقة الأولى',
  list: ['3', '1', '2'],
  nothing: null,
  gone: undefined,
};

const FROZEN_CANONICAL =
  '{"alpha":"first","amount":"350000.00","big":"9007199254740993","list":["3","1","2"],' +
  '"nested":{"a":null,"b":true},"nothing":null,"rtl":"وقف — الطبقة الأولى","share":"12.3456",' +
  '"when":"2026-01-01T00:00:00.000Z","zebra":"last"}';

const FROZEN_HASH_FROM_GENESIS = '85ef2725824dad13bcad731d592f7a8f42888d39c58bd209bef0e827ea22b640';

/** A realistic audit row, shaped exactly as `appendAuditEvent` builds one. */
const FROZEN_ROW: AuditHashRow = {
  id: BigInt(1),
  occurredAt: new Date('2026-01-01T00:00:00.000Z'),
  actorId: 'user-seed-admin',
  actorType: 'SYSTEM',
  onBehalfOfId: null,
  action: 'CREATE',
  entityType: 'Client',
  entityId: 'client-001',
  waqfId: null,
  before: null,
  after: { nameAr: 'عائلة المثال', nameEn: 'Example Family' },
  context: { requestId: 'seed' },
  category: 'MUTATION',
  classification: 'ROUTINE',
};

const FROZEN_ROW_CANONICAL =
  '{"action":"CREATE","actorId":"user-seed-admin","actorType":"SYSTEM",' +
  '"after":{"nameAr":"عائلة المثال","nameEn":"Example Family"},"before":null,' +
  '"category":"MUTATION","classification":"ROUTINE","context":{"requestId":"seed"},' +
  '"entityId":"client-001","entityType":"Client","id":"1",' +
  '"occurredAt":"2026-01-01T00:00:00.000Z","onBehalfOfId":null,"waqfId":null}';

const FROZEN_ROW_HASH = '27504b63753d56a5a5bde1266555a76b56445ca0dc8388bb973b06c7d956b2ad';

// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('canonicalJson — frozen encoding (A7, unit leg)', () => {
  it('encodes the mixed-type vector to exactly the frozen bytes', () => {
    expect(canonicalJson(serializeForAudit(FROZEN_INPUT))).toBe(FROZEN_CANONICAL);
  });

  it('hashes the frozen vector to a pinned digest', () => {
    expect(computeHash(serializeForAudit(FROZEN_INPUT), GENESIS_HASH)).toBe(
      FROZEN_HASH_FROM_GENESIS,
    );
  });

  it('projects and hashes a realistic audit row to a pinned digest', () => {
    expect(canonicalJson(buildAuditPayload(FROZEN_ROW))).toBe(FROZEN_ROW_CANONICAL);
    expect(recomputeRowHash(FROZEN_ROW, GENESIS_HASH)).toBe(FROZEN_ROW_HASH);
  });

  it('sorts object keys ascending by UTF-16 code unit and emits no whitespace', () => {
    expect(canonicalJson({ b: 'B', a: 'A', C: 'c', A: 'a' })).toBe(
      '{"A":"a","C":"c","a":"A","b":"B"}',
    );
    expect(canonicalJson({})).toBe('{}');
  });

  it('preserves array order — order is data, not presentation', () => {
    expect(canonicalJson(['c', 'a', 'b'])).toBe('["c","a","b"]');
  });

  it('omits undefined properties entirely and preserves explicit null', () => {
    // Prisma uses `undefined` for "field not present in this operation". Encoding it as null
    // would make a partial diff hash differently from a full one.
    expect(canonicalJson({ present: 'x', absent: undefined, explicit: null })).toBe(
      '{"explicit":null,"present":"x"}',
    );
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(undefined)).toBe('null');
  });

  it('escapes only quote, backslash and C0 controls, with lowercase \\u00xx', () => {
    const quote = String.fromCharCode(34);
    const backslash = String.fromCharCode(92);
    const tab = String.fromCharCode(9);
    const newline = String.fromCharCode(10);
    const soh = String.fromCharCode(1);
    expect(canonicalJson(`a${quote}b${backslash}c${tab}d${newline}e${soh}f`)).toBe(
      '"a\\"b\\\\c\\u0009d\\u000ae\\u0001f"',
    );
  });

  it('emits U+2028 verbatim rather than escaping it', () => {
    // A JSON library that escapes U+2028 for JS-embedding safety would silently change the bytes
    // being hashed. This encoder is explicitly not that library.
    const ls = String.fromCharCode(0x2028);
    expect(canonicalJson(ls)).toBe(`"${ls}"`);
  });
});

describe('canonicalJson — the JS number ban (§17 DoD)', () => {
  it('throws on a raw JS number rather than encoding it', () => {
    expect(() => canonicalJson({ amountSar: 350000 })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson({ amountSar: 350000 })).toThrow(/JS number/);
  });

  it('throws on a number nested inside an array', () => {
    expect(() => canonicalJson([1])).toThrow(CanonicalJsonError);
  });

  it('accepts the same payload once serializeForAudit has stringified it', () => {
    // The ban is a tripwire for code paths that skipped the pipeline — NOT a prohibition on Int
    // columns or on numbers legitimately living inside Setting.value / shartAlWaqif.
    expect(canonicalJson(serializeForAudit({ businessDays: 10 }))).toBe('{"businessDays":"10"}');
  });
});

describe('serializeForAudit', () => {
  it('gives a Decimal at least two decimal places and never fewer than it carries', () => {
    expect(decimalToCanonicalString(new Decimal('350000'))).toBe('350000.00');
    expect(decimalToCanonicalString(new Decimal('0'))).toBe('0.00');
    expect(decimalToCanonicalString(new Decimal('12.3456'))).toBe('12.3456');
  });

  it('stringifies BigInt losslessly beyond Number.MAX_SAFE_INTEGER', () => {
    expect(serializeForAudit(BigInt('9007199254740993'))).toBe('9007199254740993');
  });

  it('encodes a Date as ISO-8601 UTC with exactly three fractional digits', () => {
    expect(dateToCanonicalString(new Date('2026-03-31T12:34:56.789Z'))).toBe(
      '2026-03-31T12:34:56.789Z',
    );
    expect(() => dateToCanonicalString(new Date('nope'))).toThrow(CanonicalJsonError);
  });

  it('normalizes -0 to "0" so the two spellings of zero cannot produce two hashes', () => {
    expect(numberToCanonicalString(-0, '$')).toBe('0');
    expect(numberToCanonicalString(0, '$')).toBe('0');
  });

  it('refuses NaN and Infinity', () => {
    expect(() => serializeForAudit(Number.NaN)).toThrow(CanonicalJsonError);
    expect(() => serializeForAudit(Number.POSITIVE_INFINITY)).toThrow(CanonicalJsonError);
  });

  it('base64-encodes binary', () => {
    expect(serializeForAudit(Buffer.from('waqf', 'utf8'))).toBe('d2FxZg==');
  });

  it('refuses an unrecognized class instance rather than guessing an encoding', () => {
    class Mystery {
      readonly value = 1;
    }
    expect(() => serializeForAudit(new Mystery())).toThrow(/cannot be canonicalized/);
  });

  it('refuses functions and symbols', () => {
    expect(() => serializeForAudit(() => undefined)).toThrow(CanonicalJsonError);
    expect(() => serializeForAudit(Symbol('x'))).toThrow(CanonicalJsonError);
  });
});

describe('the hashed payload — 14 fields, including the deliberate §12 deviation', () => {
  it('binds exactly fourteen fields', () => {
    expect(AUDIT_HASH_PAYLOAD_FIELDS).toHaveLength(14);
    expect(new Set(AUDIT_HASH_PAYLOAD_FIELDS).size).toBe(14);
  });

  it('binds waqfId, actorType, onBehalfOfId and category — the four §12 omits', () => {
    // §12 lists ten fields. Leaving `waqfId` unbound would let a tamperer re-scope a recorded
    // event to a different endowment while the chain still verified. ADR-0003 records the
    // deviation; this test is what stops it being "corrected" back to ten.
    for (const field of ['waqfId', 'actorType', 'onBehalfOfId', 'category'] as const) {
      expect(AUDIT_HASH_PAYLOAD_FIELDS).toContain(field);
    }
  });

  it('projects only the hashed fields, ignoring everything else on the row', () => {
    const payload = buildAuditPayload({
      ...FROZEN_ROW,
      // Not hashed: a frozen Hijri snapshot, the chain links themselves, and any future column.
      occurredAtHijri: '1447-07-12',
      prevHash: GENESIS_HASH,
      rowHash: 'x',
    } as unknown as AuditHashRow);
    expect(Object.keys(payload).sort()).toEqual([...AUDIT_HASH_PAYLOAD_FIELDS].sort());
  });

  it('substitutes null for a missing optional field so absence hashes consistently', () => {
    const withoutOptional = { ...FROZEN_ROW };
    delete (withoutOptional as { onBehalfOfId?: unknown }).onBehalfOfId;
    expect(recomputeRowHash(withoutOptional, GENESIS_HASH)).toBe(FROZEN_ROW_HASH);
  });
});

describe('computeHash', () => {
  it('is 64 lowercase hex characters', () => {
    expect(GENESIS_HASH).toHaveLength(64);
    expect(GENESIS_HASH).toBe('0'.repeat(64));
    expect(computeHash({ a: 'b' }, GENESIS_HASH)).toMatch(HASH_HEX_RE);
  });

  it('is deterministic and key-order independent', () => {
    expect(computeHash({ a: '1', b: '2' }, GENESIS_HASH)).toBe(
      computeHash({ b: '2', a: '1' }, GENESIS_HASH),
    );
  });

  it('changes when the predecessor changes — the link is part of the digest', () => {
    const other = 'a'.repeat(64);
    expect(computeHash({ a: '1' }, GENESIS_HASH)).not.toBe(computeHash({ a: '1' }, other));
  });

  it('refuses a prevHash that is not 64 lowercase hex characters', () => {
    expect(() => computeHash({}, 'short')).toThrow(CanonicalJsonError);
    expect(() => computeHash({}, 'A'.repeat(64))).toThrow(CanonicalJsonError);
  });
});

describe('verifyChain (A6)', () => {
  /** Builds a real, correctly-linked chain the same way `appendAuditEvent` would. */
  function buildChain(count: number): (AuditHashRow & { prevHash: string; rowHash: string })[] {
    const rows: (AuditHashRow & { prevHash: string; rowHash: string })[] = [];
    let prevHash = GENESIS_HASH;
    for (let n = 1; n <= count; n += 1) {
      const row: AuditHashRow = {
        ...FROZEN_ROW,
        id: BigInt(n),
        occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, n)),
        entityId: `client-00${n}`,
      };
      const rowHash = recomputeRowHash(row, prevHash);
      rows.push({ ...row, prevHash, rowHash });
      prevHash = rowHash;
    }
    return rows;
  }

  it('accepts a well-formed chain and reports how many rows it checked', () => {
    const result = verifyChain(buildChain(5));
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(5);
  });

  it('accepts an empty chain', () => {
    expect(verifyChain([]).ok).toBe(true);
  });

  it('rejects a chain that does not start at genesis (rows deleted from the head)', () => {
    const rows = buildChain(3).slice(1);
    const result = verifyChain(rows);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/genesis/);
  });

  it('rejects a deleted or re-ordered row (prevHash no longer matches)', () => {
    const rows = buildChain(4);
    rows.splice(2, 1);
    const result = verifyChain(rows);
    expect(result.ok).toBe(false);
    expect(result.brokenAtId).toBe('4');
    expect(result.reason).toMatch(/deleted or re-ordered/);
  });

  it('rejects an edited row (content no longer recomputes to its rowHash)', () => {
    const rows = buildChain(3);
    const target = rows[1] as AuditHashRow & { prevHash: string; rowHash: string };
    target.action = 'DELETE_SOFT';
    const result = verifyChain(rows);
    expect(result.ok).toBe(false);
    expect(result.brokenAtId).toBe('2');
    expect(result.reason).toMatch(/does not match its rowHash/);
  });

  it('rejects a re-scoped waqfId — the reason the 14th field is bound in', () => {
    const rows = buildChain(2);
    const target = rows[0] as AuditHashRow & { prevHash: string; rowHash: string };
    target.waqfId = 'waqf-002';
    expect(verifyChain(rows).ok).toBe(false);
  });
});
