// QMULATE — unit tests for field encryption and the searchable HMAC (§12, BR-202/203, BR-501).
//
// NO DATABASE. These are the primitives that stand between a leaked `pg_dump` and a real family's
// national ids, bank details and IBANs. They are pure functions over key material, so they can and
// should be pinned exactly.
//
// TWO FROZEN VECTORS are pinned against the fixed test keys in `test/setup.ts`:
//   • a `searchHash` digest — a change to the domain separator, the normalizer, or the HMAC input
//     format silently invalidates every stored `...Hmac` column and quietly defeats the
//     no-commingling uniqueness check (BR-501);
//   • a deterministic-IV cipher envelope — a change to the envelope layout, the IV derivation or
//     the GCM AAD makes every value already at rest undecryptable.
// Neither failure announces itself in production. They announce themselves here.
//
// CONFIDENTIALITY: every plaintext below is a `FAKE-*` value from the fixture's own conventions.
// No realistic Saudi IBAN, national id or name appears in this file.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CIPHER_ENVELOPE_RE,
  FieldCryptoError,
  configureFieldCrypto,
  decryptField,
  encryptField,
  isCipherEnvelope,
  isFieldCryptoConfigured,
  maybeDecryptField,
  normalizeForHash,
  resetFieldCrypto,
  searchHash,
  searchHashEquals,
} from '../src/crypto.js';
import { TEST_FIELD_ENCRYPTION_KEY_B64, TEST_FIELD_HMAC_KEY_B64 } from './setup.js';

/** A second, distinct 32-byte key (32 × 0x0d) for the rotation tests. */
const SECOND_KEY_B64 = 'DQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0=';

const IBAN_COLUMN = 'BankAccount.ibanEnc';
const UBO_ID_COLUMN = 'Beneficiary.uboIdNumberEnc';

/** Fixture-shaped, unmistakably invented. */
const FAKE_IBAN = 'FAKE-IBAN-W1';
const FAKE_UBO_ID = 'FAKE-ID-0001';

// ── frozen against the pinned test keys ──────────────────────────────────────────────────────
const FROZEN_IBAN_DIGEST = 'b4db6c107c56635059afee0979533450c250a51c3498793cb789cdabf1f72e26';
const FROZEN_UBO_DIGEST_SAME_PLAINTEXT =
  '978fce1e31064600976e5011b46958a5f8dea9565aa101f66eca6510dd5868fd';
const FROZEN_UBO_ID_DIGEST = '82e084bbb13f2b12c611d42fe5396ea6a789e08ee9bc2c68964834b1c687d858';
const FROZEN_DETERMINISTIC_ENVELOPE = 'v1:FOIHKeV2KJSt7Wqr:zI6BI6G6zH2IBKBd:pfAlhp1olcfjtuB7Byt1gQ';

function configure(options: {
  deterministicIv: boolean;
  keys?: Record<string, string>;
  active?: string;
}): void {
  configureFieldCrypto({
    keys: options.keys ?? { '1': TEST_FIELD_ENCRYPTION_KEY_B64 },
    activeKeyVersion: options.active ?? '1',
    hmacKey: TEST_FIELD_HMAC_KEY_B64,
    deterministicIv: options.deterministicIv,
  });
}

afterEach(() => {
  resetFieldCrypto();
});

describe('normalizeForHash', () => {
  beforeEach(() => configure({ deterministicIv: false }));

  it('folds case, whitespace and punctuation so one value has one digest', () => {
    // Without this, "FAKE-IBAN-W1" and "fake iban w1" would be two different accounts as far as
    // the @@unique(ibanHmac) no-commingling check is concerned.
    expect(normalizeForHash('  fake iban w1  ')).toBe('FAKEIBANW1');
    expect(normalizeForHash('FAKE-IBAN-W1')).toBe('FAKEIBANW1');
  });

  it('keeps Arabic letters and Arabic-Indic digits — \\p{L}/\\p{N}, not [A-Z0-9]', () => {
    expect(normalizeForHash('وقف-١٢٣ ')).toBe('وقف١٢٣');
  });

  it('is idempotent', () => {
    expect(normalizeForHash(normalizeForHash('FAKE-IBAN-W1'))).toBe(
      normalizeForHash('FAKE-IBAN-W1'),
    );
  });
});

describe('searchHash', () => {
  beforeEach(() => configure({ deterministicIv: false }));

  it('matches its frozen digest for the pinned test key', () => {
    expect(searchHash(IBAN_COLUMN, FAKE_IBAN)).toBe(FROZEN_IBAN_DIGEST);
    expect(searchHash(UBO_ID_COLUMN, FAKE_UBO_ID)).toBe(FROZEN_UBO_ID_DIGEST);
  });

  it('is 64 lowercase hex characters', () => {
    expect(searchHash(IBAN_COLUMN, FAKE_IBAN)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is insensitive to formatting, because it hashes the normalized form', () => {
    expect(searchHash(IBAN_COLUMN, '  fake iban w1  ')).toBe(FROZEN_IBAN_DIGEST);
  });

  it('is DOMAIN SEPARATED — the same plaintext in a different column digests differently', () => {
    // Without separation, a digest lifted from bank_account could be replayed against
    // beneficiary to confirm "this UBO's id equals that IBAN".
    expect(searchHash(UBO_ID_COLUMN, FAKE_IBAN)).toBe(FROZEN_UBO_DIGEST_SAME_PLAINTEXT);
    expect(searchHash(UBO_ID_COLUMN, FAKE_IBAN)).not.toBe(searchHash(IBAN_COLUMN, FAKE_IBAN));
  });

  it('distinguishes different plaintexts', () => {
    expect(searchHash(IBAN_COLUMN, 'FAKE-IBAN-W1')).not.toBe(
      searchHash(IBAN_COLUMN, 'FAKE-IBAN-W3'),
    );
  });

  it('compares digests in constant time and rejects a length mismatch', () => {
    const digest = searchHash(IBAN_COLUMN, FAKE_IBAN);
    expect(searchHashEquals(digest, digest)).toBe(true);
    expect(searchHashEquals(digest, digest.slice(0, 32))).toBe(false);
    expect(searchHashEquals(digest, `${digest.slice(0, 63)}0`)).toBe(false);
  });
});

describe('encryptField / decryptField', () => {
  it('round-trips and produces a well-formed self-describing envelope', () => {
    configure({ deterministicIv: false });
    const envelope = encryptField(IBAN_COLUMN, FAKE_IBAN);

    expect(envelope).toMatch(CIPHER_ENVELOPE_RE);
    expect(envelope.startsWith('v1:')).toBe(true);
    expect(envelope).not.toContain(FAKE_IBAN);
    expect(isCipherEnvelope(envelope)).toBe(true);
    expect(decryptField(IBAN_COLUMN, envelope)).toBe(FAKE_IBAN);
  });

  it('uses a fresh random IV by default, so equal plaintexts do not look equal', () => {
    configure({ deterministicIv: false });
    const a = encryptField(IBAN_COLUMN, FAKE_IBAN);
    const b = encryptField(IBAN_COLUMN, FAKE_IBAN);
    expect(a).not.toBe(b);
    expect(decryptField(IBAN_COLUMN, a)).toBe(FAKE_IBAN);
    expect(decryptField(IBAN_COLUMN, b)).toBe(FAKE_IBAN);
  });

  it('binds the column into the GCM AAD — a ciphertext moved to another column will not decrypt', () => {
    configure({ deterministicIv: false });
    const envelope = encryptField(IBAN_COLUMN, FAKE_IBAN);
    expect(() => decryptField(UBO_ID_COLUMN, envelope)).toThrow(FieldCryptoError);
    expect(() => decryptField(UBO_ID_COLUMN, envelope)).toThrow(/failed authenticated decryption/);
  });

  it('detects a tampered ciphertext rather than returning garbage', () => {
    configure({ deterministicIv: false });
    const parts = encryptField(IBAN_COLUMN, FAKE_IBAN).split(':');
    const ct = parts[2] as string;
    // Flip the FIRST base64url character: its six bits are always significant, whereas the last
    // character of an unpadded segment can carry unused bits and decode to the same bytes.
    const flipped = `${ct.startsWith('A') ? 'B' : 'A'}${ct.slice(1)}`;
    const tampered = [parts[0] as string, parts[1] as string, flipped, parts[3] as string].join(
      ':',
    );
    expect(() => decryptField(IBAN_COLUMN, tampered)).toThrow(FieldCryptoError);
  });

  it('rejects a value that is not an envelope at all', () => {
    configure({ deterministicIv: false });
    expect(() => decryptField(IBAN_COLUMN, FAKE_IBAN)).toThrow(/not a QMULATE cipher envelope/);
  });

  describe('deterministic IV (fixture-only affordance for A7)', () => {
    it('produces the frozen envelope for the pinned key', () => {
      configure({ deterministicIv: true });
      expect(encryptField(IBAN_COLUMN, FAKE_IBAN)).toBe(FROZEN_DETERMINISTIC_ENVELOPE);
      expect(decryptField(IBAN_COLUMN, FROZEN_DETERMINISTIC_ENVELOPE)).toBe(FAKE_IBAN);
    });

    it('makes equal plaintexts produce equal ciphertexts — the leak it trades away', () => {
      configure({ deterministicIv: true });
      expect(encryptField(IBAN_COLUMN, FAKE_IBAN)).toBe(encryptField(IBAN_COLUMN, FAKE_IBAN));
      expect(encryptField(IBAN_COLUMN, 'FAKE-IBAN-W3')).not.toBe(
        encryptField(IBAN_COLUMN, FAKE_IBAN),
      );
    });

    it('defaults to ON under DATA_CLASSIFICATION=fixture-only and OFF otherwise', () => {
      const saved = process.env.DATA_CLASSIFICATION;
      try {
        process.env.DATA_CLASSIFICATION = 'fixture-only';
        resetFieldCrypto();
        configureFieldCrypto({
          keys: { '1': TEST_FIELD_ENCRYPTION_KEY_B64 },
          activeKeyVersion: '1',
          hmacKey: TEST_FIELD_HMAC_KEY_B64,
        });
        expect(encryptField(IBAN_COLUMN, FAKE_IBAN)).toBe(FROZEN_DETERMINISTIC_ENVELOPE);

        process.env.DATA_CLASSIFICATION = 'production';
        resetFieldCrypto();
        configureFieldCrypto({
          keys: { '1': TEST_FIELD_ENCRYPTION_KEY_B64 },
          activeKeyVersion: '1',
          hmacKey: TEST_FIELD_HMAC_KEY_B64,
        });
        // Production can never reach the deterministic path — that is the whole safety argument.
        expect(encryptField(IBAN_COLUMN, FAKE_IBAN)).not.toBe(FROZEN_DETERMINISTIC_ENVELOPE);
      } finally {
        if (saved === undefined) delete process.env.DATA_CLASSIFICATION;
        else process.env.DATA_CLASSIFICATION = saved;
      }
    });

    it.todo(
      'SURFACED (SCOPE/SECURITY): deterministic IV exists only so A7 can pin a frozen final rowHash. ' +
        'Since the audit extension now stores "[encrypted]" rather than ciphertext, the ciphertext no ' +
        'longer enters the hash and this affordance may be unnecessary. Confirm the trade or drop it.',
    );
  });

  describe('key rotation', () => {
    it('keeps reading a retired key while writing with the active one', () => {
      configure({ deterministicIv: false });
      const underV1 = encryptField(IBAN_COLUMN, FAKE_IBAN);

      resetFieldCrypto();
      configure({
        deterministicIv: false,
        keys: { '1': TEST_FIELD_ENCRYPTION_KEY_B64, '2': SECOND_KEY_B64 },
        active: '2',
      });

      expect(encryptField(IBAN_COLUMN, FAKE_IBAN).startsWith('v2:')).toBe(true);
      expect(decryptField(IBAN_COLUMN, underV1)).toBe(FAKE_IBAN);
    });

    it('refuses to decrypt with a key version that was dropped from the map', () => {
      configure({ deterministicIv: false, keys: { '2': SECOND_KEY_B64 }, active: '2' });
      const orphan = `v9:${'A'.repeat(16)}:${'A'.repeat(16)}:${'A'.repeat(22)}`;
      expect(() => decryptField(IBAN_COLUMN, orphan)).toThrow(/key version "9"/);
    });

    it('refuses an active key version that is not in the map', () => {
      expect(() =>
        configureFieldCrypto({
          keys: { '1': TEST_FIELD_ENCRYPTION_KEY_B64 },
          activeKeyVersion: '7',
          hmacKey: TEST_FIELD_HMAC_KEY_B64,
          deterministicIv: false,
        }),
      ).toThrow(/not present in the key map/);
    });

    it('refuses a key of the wrong length', () => {
      expect(() =>
        configureFieldCrypto({
          keys: { '1': Buffer.alloc(16, 1).toString('base64') },
          activeKeyVersion: '1',
          hmacKey: TEST_FIELD_HMAC_KEY_B64,
          deterministicIv: false,
        }),
      ).toThrow(/must be 32 bytes/);
    });

    it('refuses an HMAC key of the wrong length', () => {
      expect(() =>
        configureFieldCrypto({
          keys: { '1': TEST_FIELD_ENCRYPTION_KEY_B64 },
          activeKeyVersion: '1',
          hmacKey: Buffer.alloc(8, 1).toString('base64'),
          deterministicIv: false,
        }),
      ).toThrow(/FIELD_HMAC_KEY must be 32 bytes/);
    });
  });
});

describe('configuration failure is loud, not silent', () => {
  it('refuses to encrypt when no key material is available anywhere', () => {
    const saved = {
      keys: process.env.FIELD_ENCRYPTION_KEYS,
      active: process.env.FIELD_ENCRYPTION_ACTIVE_KEY,
      hmac: process.env.FIELD_HMAC_KEY,
    };
    try {
      delete process.env.FIELD_ENCRYPTION_KEYS;
      delete process.env.FIELD_ENCRYPTION_ACTIVE_KEY;
      delete process.env.FIELD_HMAC_KEY;
      resetFieldCrypto();

      expect(isFieldCryptoConfigured()).toBe(false);
      // Encryption must never degrade to a no-op: a missing key is an outage, not plaintext.
      expect(() => encryptField(IBAN_COLUMN, FAKE_IBAN)).toThrow(
        /field encryption is not configured/,
      );
      expect(() => searchHash(IBAN_COLUMN, FAKE_IBAN)).toThrow(FieldCryptoError);
    } finally {
      if (saved.keys !== undefined) process.env.FIELD_ENCRYPTION_KEYS = saved.keys;
      if (saved.active !== undefined) process.env.FIELD_ENCRYPTION_ACTIVE_KEY = saved.active;
      if (saved.hmac !== undefined) process.env.FIELD_HMAC_KEY = saved.hmac;
      resetFieldCrypto();
    }
  });

  it('loads from process.env when nothing was injected', () => {
    resetFieldCrypto();
    expect(isFieldCryptoConfigured()).toBe(true);
  });

  it.todo(
    'SURFACED (ENV): FIELD_ENCRYPTION_KEYS / FIELD_ENCRYPTION_ACTIVE_KEY / FIELD_HMAC_KEY are read ' +
      'straight from process.env but are absent from @qmulate/config serverEnvSchema, from ' +
      '.env.example and from every CI job — so the fail-fast env guarantee does not cover them and ' +
      'the CI seed step cannot write a UBO or IBAN column. test/setup.ts defaults them; the schema ' +
      'and CI must too.',
  );
});

describe('envelope recognition', () => {
  beforeEach(() => configure({ deterministicIv: false }));

  it('does not mistake ordinary text for a ciphertext', () => {
    for (const value of [
      FAKE_IBAN,
      '',
      'v1:',
      'v1:a:b',
      'vX:a:b:c',
      'v1:a:b:c:d',
      42,
      null,
      undefined,
    ]) {
      expect(isCipherEnvelope(value)).toBe(false);
    }
  });

  it('passes plaintext through maybeDecryptField untouched', () => {
    expect(maybeDecryptField(IBAN_COLUMN, FAKE_IBAN)).toBe(FAKE_IBAN);
    expect(maybeDecryptField(IBAN_COLUMN, null)).toBeNull();
    expect(maybeDecryptField(IBAN_COLUMN, encryptField(IBAN_COLUMN, FAKE_IBAN))).toBe(FAKE_IBAN);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The encrypted-column registry.
//
// Loaded dynamically: `src/extensions/encryption.ts` imports the GENERATED Prisma client for
// `Prisma.defineExtension`, so a static import would take the whole file down on a checkout where
// `prisma generate` has not run yet. The failure below is deliberately an error, not a skip.
//
// `import type * as …` is fully erased at compile time, so it types the dynamic import without
// reintroducing a runtime one.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import type * as EncryptionModuleShape from '../src/extensions/encryption.js';

type EncryptionModule = typeof EncryptionModuleShape;

describe('encrypted-column registry', () => {
  let registry: EncryptionModule;

  beforeAll(async () => {
    registry = await import('../src/extensions/encryption.js');
  });

  it('encrypts exactly five columns — the UBO minimum dataset, the waqf IBAN, and (S9-4b) the SAR summary', () => {
    expect([...registry.ENCRYPTED_COLUMN_NAMES].sort()).toEqual([
      'ibanEnc',
      'suspicionSummaryEnc',
      'uboBankingRefEnc',
      'uboIdNumberEnc',
      'uboIdTypeEnc',
    ]);
  });

  it('derives three searchable digests', () => {
    expect([...registry.HMAC_COLUMN_NAMES].sort()).toEqual([
      'ibanHmac',
      'uboBankingRefHmac',
      'uboIdNumberHmac',
    ]);
  });

  it('resolves each column to its owning model for AAD and domain separation', () => {
    expect(registry.qualifiedColumn('ibanEnc')).toBe(IBAN_COLUMN);
    expect(registry.qualifiedColumn('uboIdNumberEnc')).toBe(UBO_ID_COLUMN);
    expect(() => registry.qualifiedColumn('nameAr')).toThrow(/not a registered encrypted column/);
  });

  it('records DistributionLineItem.transferRef as a known unencrypted sensitive field', () => {
    expect(registry.KNOWN_UNENCRYPTED_SENSITIVE_FIELDS).toContain(
      'DistributionLineItem.transferRef',
    );
  });

  it('leaves uboIdTypeEnc without a searchable sibling', () => {
    // Real, current behaviour — and the reason a change to `uboIdTypeEnc` is invisible in an
    // audit diff (the audit extension redacts the ciphertext and there is no digest to fall back
    // on). Asserted so the gap cannot be forgotten.
    expect(registry.ENCRYPTED_FIELDS.Beneficiary.uboIdTypeEnc).toBeNull();
  });

  it.todo(
    'SURFACED (SCOPE): §12 names "distribution payout references" as an encryption target while §07 ' +
      'models DistributionLineItem.transferRef as plain String. Renaming it to transferRefEnc is free ' +
      'in E6/S7 and a data migration after the first real payout.',
  );

  it.todo(
    'GAP: uboIdTypeEnc has no ...Hmac sibling, so a change to it produces no visible diff in the ' +
      'audit trail. Either add a sibling digest or accept and document the blind spot.',
  );
});
