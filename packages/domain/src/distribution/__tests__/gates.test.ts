/**
 * `distribution/gates.test.ts` — Stage 3: who is PAYABLE now.
 *
 * What this suite is FOR, so a later reader does not weaken it by accident:
 *
 * 1. **It drives behaviour, never source shape.** Every assertion runs `evaluateGates` (or one of
 *    the four predicates) and checks the verdict. Nothing here asserts that a string appears near a
 *    call site — that anti-pattern shipped a bypassable guard in Sprint 2 and must not reappear.
 * 2. **The boundaries are the product.** "Age > 12 months" has an undefined edge in §08, and an
 *    off-by-one there is a wrongly-blocked or wrongly-paid family member. Every boundary is pinned
 *    on the day *before*, the day *of*, and the day *after*.
 * 3. **Precedence is proved, not restated.** Exactly ONE test pins the literal §08 order of
 *    `GATE_PRECEDENCE`; every other test derives its expected flag order from that constant, so a
 *    reordering fails once, loudly, in the anchor test instead of silently agreeing with itself.
 * 4. **A dropped flag is lost evidence.** All ten pairwise gate combinations, plus the four-gate and
 *    five-gate cases, assert the winning `status`, the binding `reasonCode` AND the complete
 *    `gateFlags` set. A gate that trips and is not reported is a defect even when the status is right.
 * 5. **I6 (withhold-never-reallocates) is checked at this module's own surface.** A `GateOutcome`
 *    must carry no monetary field at all — that is the runtime half of the type-level proof that a
 *    gate cannot move a halala.
 */

import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { addCalendarDays, civilDate } from '../../dates/index.js';
import type { CivilDate } from '../../dates/index.js';
import { isDomainError } from '../../errors.js';
import type { DomainError } from '../../errors.js';
import {
  BENEFICIARY_KINDS,
  GATE_REASON_CODES,
  RESIDENCIES,
  VERIFICATION_STATUSES,
  beneficiaryInputSchema,
} from '../contract.js';
import type { BeneficiaryInput, GateReasonCode } from '../contract.js';
import {
  GATE_PRECEDENCE,
  GATE_REASON_TEXT,
  evaluateGates,
  gateReasonText,
  isCategoryUncaptured,
  isEntityUnlicensed,
  isKycStale,
  isKycUnverified,
} from '../gates.js';
import type { GateOutcome } from '../gates.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Fixtures — invented records only (CLAUDE.md hard constraint), built THROUGH the real schema
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type BeneficiaryRaw = z.input<typeof beneficiaryInputSchema>;

/**
 * Vitest's default `testTimeout` is 5 s. This suite's fast-check properties finish in well under a
 * second in isolation, but that is not the environment CI runs them in: measured under a full
 * `turbo run test` (nine packages' suites executing concurrently), the 2 000-run split property
 * took **5 064 ms and FAILED ON THE CLOCK, not on an assertion** — an ~11× slowdown from pure
 * contention. A 2-core GitHub runner is slower still, so the default is a latent red build, not a
 * theoretical risk.
 *
 * File-scoped, and the same budget and rationale as `distribution.property.test.ts`: generous enough
 * that contention cannot fail it, tight enough that a genuine performance regression (an accidental
 * O(n²) in the allocator, a `Decimal` blowup on 18-dp weights) still does.
 */
vi.setConfig({ testTimeout: 60_000 });

/** The injected clock for the whole suite. Worked examples A/B/D/E all run at this date. */
const ASOF = civilDate('2026-07-14');

/** ⚠ unverified figure — `Setting kyc.refreshIntervalMonths`, seeded 12. Never a coded default. */
const KYC_MONTHS = 12;

/**
 * A beneficiary who trips NOTHING: family line, verified, KYC fresh (2026-01-15 + 12mo =
 * 2027-01-15), domestic, no disbursing entity. Every test bends exactly the fields its gate reads,
 * so a failure names one gate rather than a soup of them.
 */
const CLEAN: BeneficiaryRaw = {
  id: 'ben-001',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '12.5',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-01-15',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-ACCT-W1',
};

/** Parse a patched raw record through the real contract schema, so the types are the shipped ones. */
function ben(patch: Partial<BeneficiaryRaw> = {}): BeneficiaryInput {
  return beneficiaryInputSchema.parse({ ...CLEAN, ...patch });
}

/** Run stage 3 at {@link ASOF} with the resolved refresh window. */
function gates(patch: Partial<BeneficiaryRaw> = {}, kycRefreshMonths = KYC_MONTHS): GateOutcome {
  return evaluateGates({
    beneficiary: ben(patch),
    asOfGregorian: ASOF,
    kycRefreshMonths,
  });
}

/**
 * The expected `gateFlags` for a set of reasons, **ordered by `GATE_PRECEDENCE` itself**.
 *
 * Deriving the order from the constant is the point (AT-10): the order is pinned exactly once, in
 * `pins the §08 precedence order literally`, and nowhere else restated.
 */
function inPrecedenceOrder(reasons: readonly GateReasonCode[]): readonly GateReasonCode[] {
  const wanted = new Set(reasons);
  return GATE_PRECEDENCE.filter((code) => wanted.has(code));
}

/** Assert a thrown value is a `DomainError` with an exact code, and return it for further checks. */
function expectDomainCode(run: () => unknown, code: string): DomainError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  if (!isDomainError(caught)) {
    throw new Error(
      `expected a DomainError with code ${code}, got ${
        caught === undefined ? 'no throw' : `${String(caught)} (${typeof caught})`
      }`,
    );
  }
  expect(caught.code).toBe(code);
  return caught;
}

/** An unlicensed jiha, for the licence gate. `licensed: false` with no expiry recorded. */
const UNLICENSED_ENTITY = {
  name: 'Fake Charitable Jiha',
  licensed: false,
  licenceExpiry: null,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * GATE_PRECEDENCE — the ordering contract
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('GATE_PRECEDENCE', () => {
  it('pins the §08 precedence order literally (the anchor every other test derives from)', () => {
    expect([...GATE_PRECEDENCE]).toEqual([
      'CATEGORY_NOT_CAPTURED',
      'ENTITY_UNLICENSED',
      'STALE_KYC',
      'KYC_UNVERIFIED',
      'CROSS_BORDER_PENDING',
    ]);
  });

  it('ranks EVERY gate reason exactly once — an unranked gate could never be reported', () => {
    // `gateFlags` is built by iterating GATE_PRECEDENCE, so a reason missing from it would trip
    // silently and vanish from a beneficiary's evidence. Set equality in both directions.
    expect([...GATE_PRECEDENCE].sort()).toEqual([...GATE_REASON_CODES].sort());
    expect(new Set(GATE_PRECEDENCE).size).toBe(GATE_PRECEDENCE.length);
  });

  it('is frozen — the payability order of a live endowment is not runtime-editable', () => {
    expect(Object.isFrozen(GATE_PRECEDENCE)).toBe(true);
    expect(() => (GATE_PRECEDENCE as GateReasonCode[]).push('STALE_KYC')).toThrow(TypeError);
  });

  it('puts CROSS_BORDER_PENDING last — routing must never outrank a block', () => {
    expect(GATE_PRECEDENCE[GATE_PRECEDENCE.length - 1]).toBe('CROSS_BORDER_PENDING');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * PAID — the no-gate case
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('a beneficiary tripping no gate', () => {
  it('is PAID with no reason and no flags', () => {
    expect(gates()).toEqual({ status: 'PAID', reasonCode: null, gateFlags: [] });
  });

  it('is PAID whatever the tabaqa, line, branch or weight — those are stage 2, not stage 3', () => {
    // A gate reads payability only. Entitlement shape must not influence it, or stage 2's verdict
    // would be silently re-decided here.
    for (const patch of [
      { tabaqa: 7 },
      { line: 'BUTUN' as const },
      { branch: null },
      { stipulatedWeight: '0' },
      { active: false },
      { bankingRefForProceeds: null },
    ]) {
      expect(gates(patch).status).toBe('PAID');
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Gate 1 — CATEGORY_NOT_CAPTURED
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('gate · CATEGORY_NOT_CAPTURED', () => {
  const CATEGORY_ONLY = { kind: 'CATEGORY_ONLY' as const, tabaqa: null, line: 'NA' as const };

  it('withholds a CATEGORY_ONLY line whose category is null', () => {
    expect(gates({ ...CATEGORY_ONLY, category: null })).toEqual({
      status: 'WITHHELD',
      reasonCode: 'CATEGORY_NOT_CAPTURED',
      gateFlags: ['CATEGORY_NOT_CAPTURED'],
    });
  });

  it('withholds a CATEGORY_ONLY line whose category is the empty string', () => {
    expect(gates({ ...CATEGORY_ONLY, category: '' }).reasonCode).toBe('CATEGORY_NOT_CAPTURED');
  });

  it('withholds a CATEGORY_ONLY line whose category is only whitespace — a space is not a capture', () => {
    // The bypass test. A guard a single typed space unlocks is a guard an operator defeats under
    // deadline pressure; "category empty" means nobody has said who this is.
    for (const blank of [' ', '   ', '\t', '\n', ' \t\n ']) {
      expect(gates({ ...CATEGORY_ONLY, category: blank }).reasonCode).toBe('CATEGORY_NOT_CAPTURED');
    }
  });

  it('pays a CATEGORY_ONLY line once the category IS captured', () => {
    expect(gates({ ...CATEGORY_ONLY, category: 'orphans of the district' }).status).toBe('PAID');
  });

  it('does NOT gate a FAMILY or CHARITABLE_JIHA line for a null category', () => {
    // Neither kind is identified by a category; a null there is ordinary data, not a block.
    expect(gates({ kind: 'FAMILY', category: null }).status).toBe('PAID');
    expect(
      gates({ kind: 'CHARITABLE_JIHA', tabaqa: null, line: 'NA', category: null }).status,
    ).toBe('PAID');
  });

  it('isCategoryUncaptured agrees on each case', () => {
    expect(isCategoryUncaptured(ben({ ...CATEGORY_ONLY, category: null }))).toBe(true);
    expect(isCategoryUncaptured(ben({ ...CATEGORY_ONLY, category: '  ' }))).toBe(true);
    expect(isCategoryUncaptured(ben({ ...CATEGORY_ONLY, category: 'widows' }))).toBe(false);
    expect(isCategoryUncaptured(ben({ kind: 'FAMILY', category: null }))).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Gate 2 — ENTITY_UNLICENSED
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('gate · ENTITY_UNLICENSED', () => {
  it('withholds when the disbursing entity is not licensed', () => {
    expect(gates({ disbursingEntity: { ...UNLICENSED_ENTITY } })).toEqual({
      status: 'WITHHELD',
      reasonCode: 'ENTITY_UNLICENSED',
      gateFlags: ['ENTITY_UNLICENSED'],
    });
  });

  it('withholds when the licence expired BEFORE asOf', () => {
    expect(
      gates({
        disbursingEntity: { name: 'Fake Jiha', licensed: true, licenceExpiry: '2026-07-13' },
      }).reasonCode,
    ).toBe('ENTITY_UNLICENSED');
  });

  it('pays when the licence expires ON asOf — expiry day is still valid', () => {
    // Inclusive, matching the KYC boundary. The day either side is pinned below.
    expect(
      gates({
        disbursingEntity: { name: 'Fake Jiha', licensed: true, licenceExpiry: '2026-07-14' },
      }).status,
    ).toBe('PAID');
  });

  it('pays when the licence expires after asOf', () => {
    expect(
      gates({
        disbursingEntity: { name: 'Fake Jiha', licensed: true, licenceExpiry: '2027-06-30' },
      }).status,
    ).toBe('PAID');
  });

  it('pays when there is no disbursing entity at all — a natural person has no licence', () => {
    expect(gates({ disbursingEntity: null }).status).toBe('PAID');
    expect(isEntityUnlicensed(null, ASOF)).toBe(false);
  });

  it('reads a null licenceExpiry as "no expiry recorded", so `licensed` alone governs', () => {
    // ⚠ SURFACED, NOT DECIDED — see gates.ts: the fail-closed reading (an unrecorded expiry is an
    // unverifiable licence and should block) is a question for counsel. This test pins TODAY's
    // behaviour so a change is a deliberate, visible one.
    expect(
      gates({ disbursingEntity: { name: 'Fake Jiha', licensed: true, licenceExpiry: null } })
        .status,
    ).toBe('PAID');
    expect(
      gates({ disbursingEntity: { name: 'Fake Jiha', licensed: false, licenceExpiry: null } })
        .reasonCode,
    ).toBe('ENTITY_UNLICENSED');
  });

  it('never leaks the entity name or the banking reference into the outcome (PII / BR-501)', () => {
    // The outcome is persisted and hashed with the run. Codes only — no names, no account refs.
    const outcome = gates({
      disbursingEntity: { ...UNLICENSED_ENTITY },
      bankingRefForProceeds: 'FAKE-IBAN-0001',
    });
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain('Fake Charitable Jiha');
    expect(serialized).not.toContain('FAKE-IBAN-0001');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Gates 3 & 4 — the two KYC conditions, and why they must never both fire on one record
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('gate · KYC_UNVERIFIED', () => {
  it('withholds a PENDING verification', () => {
    expect(gates({ verificationStatus: 'PENDING' })).toEqual({
      status: 'WITHHELD',
      reasonCode: 'KYC_UNVERIFIED',
      gateFlags: ['KYC_UNVERIFIED'],
    });
  });

  it('withholds an UNVERIFIED verification', () => {
    expect(gates({ verificationStatus: 'UNVERIFIED' }).reasonCode).toBe('KYC_UNVERIFIED');
  });

  it('withholds a record with NO kycLastRefreshed date, even when it claims VERIFIED', () => {
    // The hole §08 leaves open: "verified" with no evidence date places the verification nowhere,
    // so nothing proves it is inside the refresh window. Fail closed.
    expect(gates({ verificationStatus: 'VERIFIED', kycLastRefreshed: null })).toEqual({
      status: 'WITHHELD',
      reasonCode: 'KYC_UNVERIFIED',
      gateFlags: ['KYC_UNVERIFIED'],
    });
  });

  it('reports KYC_UNVERIFIED ALONE for a never-verified record — STALE_KYC must not double-fire', () => {
    // Worked examples A (ben-003: PENDING, null) and B (ben-005: UNVERIFIED, null) both assert
    // exactly `['KYC_UNVERIFIED']`. Two codes for one condition is two ar/en messages that will
    // diverge, and it would also flip the binding reason to STALE_KYC (rank 2 beats rank 3).
    for (const status of ['PENDING', 'UNVERIFIED', 'VERIFIED'] as const) {
      const outcome = gates({ verificationStatus: status, kycLastRefreshed: null });
      expect(outcome.gateFlags).toEqual(['KYC_UNVERIFIED']);
      expect(outcome.gateFlags).not.toContain('STALE_KYC');
    }
    expect(isKycStale(null, ASOF, KYC_MONTHS)).toBe(false);
  });

  it('isKycUnverified is false only for VERIFIED with an evidence date', () => {
    expect(isKycUnverified(ben({ verificationStatus: 'VERIFIED' }))).toBe(false);
    expect(isKycUnverified(ben({ verificationStatus: 'PENDING' }))).toBe(true);
    expect(isKycUnverified(ben({ verificationStatus: 'UNVERIFIED' }))).toBe(true);
    expect(isKycUnverified(ben({ verificationStatus: 'VERIFIED', kycLastRefreshed: null }))).toBe(
      true,
    );
  });
});

describe('gate · STALE_KYC', () => {
  it('withholds a verification that has aged past the window (worked example E)', () => {
    // 2025-06-01 + 12 calendar months = 2026-06-01; asOf 2026-07-14 is later ⇒ stale (13m13d).
    expect(gates({ kycLastRefreshed: '2025-06-01' })).toEqual({
      status: 'WITHHELD',
      reasonCode: 'STALE_KYC',
      gateFlags: ['STALE_KYC'],
    });
  });

  it('reports STALE_KYC ALONE for a VERIFIED-but-expired record', () => {
    // Worked example E asserts exactly `['STALE_KYC']`; KYC_UNVERIFIED must not also appear, or the
    // "never verified" and "verified then expired" conditions become indistinguishable.
    expect(gates({ kycLastRefreshed: '2025-06-01' }).gateFlags).not.toContain('KYC_UNVERIFIED');
  });

  describe('the expiry boundary — day before, day of, day after', () => {
    // asOf is 2026-07-14 throughout, window 12 months.
    it('is FRESH on the expiry day itself (2025-07-14 → expiry 2026-07-14)', () => {
      expect(isKycStale(civilDate('2025-07-14'), ASOF, KYC_MONTHS)).toBe(false);
      expect(gates({ kycLastRefreshed: '2025-07-14' }).status).toBe('PAID');
    });

    it('is STALE one day earlier (2025-07-13 → expiry 2026-07-13, asOf is later)', () => {
      expect(isKycStale(civilDate('2025-07-13'), ASOF, KYC_MONTHS)).toBe(true);
      expect(gates({ kycLastRefreshed: '2025-07-13' }).reasonCode).toBe('STALE_KYC');
    });

    it('is FRESH one day later (2025-07-15 → expiry 2026-07-15)', () => {
      expect(isKycStale(civilDate('2025-07-15'), ASOF, KYC_MONTHS)).toBe(false);
      expect(gates({ kycLastRefreshed: '2025-07-15' }).status).toBe('PAID');
    });
  });

  it('matches the worked examples: A (2026-01-15) and B (2025-12-01) are both fresh', () => {
    expect(isKycStale(civilDate('2026-01-15'), ASOF, KYC_MONTHS)).toBe(false);
    expect(isKycStale(civilDate('2025-12-01'), ASOF, KYC_MONTHS)).toBe(false);
  });

  it('counts CALENDAR months through ../dates, clamping a month-end refresh date', () => {
    // 2025-08-31 + 6 months clamps to 2026-02-28 (February has no 31st). Proving the clamp here is
    // proving there is no second month arithmetic in the engine.
    const refreshed = civilDate('2025-08-31');
    expect(isKycStale(refreshed, civilDate('2026-02-28'), 6)).toBe(false);
    expect(isKycStale(refreshed, civilDate('2026-03-01'), 6)).toBe(true);
  });

  it('treats a refresh date in the future as fresh, never stale', () => {
    expect(isKycStale(civilDate('2030-01-01'), ASOF, KYC_MONTHS)).toBe(false);
    expect(isKycStale(civilDate('2030-01-01'), ASOF, 0)).toBe(false);
  });

  it('handles a zero-month window: fresh on the refresh day, stale the day after', () => {
    // A 0-month window is legal per the contract (`int().nonnegative()`), and it means "re-verify
    // same-day". Documented rather than silently refused — refusing it would be a policy decision.
    const refreshed = civilDate('2026-07-14');
    expect(isKycStale(refreshed, civilDate('2026-07-14'), 0)).toBe(false);
    expect(isKycStale(refreshed, civilDate('2026-07-15'), 0)).toBe(true);
  });

  describe('refuses an unusable refresh window rather than guessing (binding rule 3)', () => {
    it('rejects a non-integer window', () => {
      expectDomainCode(() => isKycStale(civilDate('2026-01-15'), ASOF, 12.5), 'SETTING_INVALID');
    });

    it('rejects a negative window', () => {
      expectDomainCode(() => isKycStale(civilDate('2026-01-15'), ASOF, -1), 'SETTING_INVALID');
    });

    it('rejects NaN and Infinity', () => {
      expectDomainCode(
        () => isKycStale(civilDate('2026-01-15'), ASOF, Number.NaN),
        'SETTING_INVALID',
      );
      expectDomainCode(
        () => isKycStale(civilDate('2026-01-15'), ASOF, Number.POSITIVE_INFINITY),
        'SETTING_INVALID',
      );
    });

    it('converts a calendar overflow into a typed DomainError, not a raw RangeError', () => {
      // An absurd window (1,000,000 months) pushes the expiry past year 9999. Returning "fresh"
      // would honour it as "KYC never expires" and pay against unverified identity; returning
      // "stale" would block a family over a config typo. The engine refuses, typed, so no untyped
      // third-party exception escapes the pure core.
      const error = expectDomainCode(
        () => isKycStale(civilDate('2026-01-15'), ASOF, 1_000_000),
        'SETTING_INVALID',
      );
      expect(error.details).toMatchObject({ settingKey: 'kyc.refreshIntervalMonths' });
    });

    it('converts an overflow caused by a late refresh DATE the same way', () => {
      expectDomainCode(
        () => isKycStale(civilDate('9999-06-01'), ASOF, KYC_MONTHS),
        'SETTING_INVALID',
      );
    });

    it('propagates the refusal through evaluateGates — it is never swallowed into "fresh"', () => {
      expectDomainCode(
        () => gates({ kycLastRefreshed: '2026-01-15' }, 1_000_000),
        'SETTING_INVALID',
      );
      // And a never-verified record short-circuits before the window is consulted at all.
      expect(gates({ kycLastRefreshed: null }, 1_000_000).reasonCode).toBe('KYC_UNVERIFIED');
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Gate 5 — CROSS_BORDER_PENDING is a route, not a block
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('gate · CROSS_BORDER_PENDING', () => {
  it('routes a clean cross-border line rather than withholding it', () => {
    const outcome = gates({ residency: 'CROSS_BORDER' });
    expect(outcome).toEqual({
      status: 'CROSS_BORDER_PENDING',
      reasonCode: 'CROSS_BORDER_PENDING',
      gateFlags: ['CROSS_BORDER_PENDING'],
    });
    // The distinction that matters: routed, not blocked (BR-511; Nazarah Art. 10(7) — ⚠ verify).
    expect(outcome.status).not.toBe('WITHHELD');
  });

  it('leaves a domestic line untouched', () => {
    expect(gates({ residency: 'DOMESTIC' }).gateFlags).not.toContain('CROSS_BORDER_PENDING');
  });

  it('yields CROSS_BORDER_PENDING status only when NOTHING else trips', () => {
    // Any blocking gate demotes the line to WITHHELD while still recording the routing flag, so the
    // cross-border requirement is not lost when the payment is stopped for another reason.
    const outcome = gates({ residency: 'CROSS_BORDER', kycLastRefreshed: '2025-06-01' });
    expect(outcome.status).toBe('WITHHELD');
    expect(outcome.gateFlags).toContain('CROSS_BORDER_PENDING');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Precedence — every pairwise combination, plus the four- and five-gate cases
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Each case states the beneficiary patch and the gates it is EXPECTED to trip. The expected
 * `gateFlags` array is then derived from `GATE_PRECEDENCE` (never restated), and the expected
 * `reasonCode` is the first of them — so a precedence change fails only in the anchor test.
 *
 * All ten pairs are present because all ten can genuinely co-occur. Note the KYC pair: `PENDING`
 * with an OLD date trips both `STALE_KYC` (the date aged out) and `KYC_UNVERIFIED` (never verified),
 * which is why its patch cannot be a naive merge of the two single-gate patches.
 */
const COMBINATIONS: readonly {
  readonly label: string;
  readonly patch: Partial<BeneficiaryRaw>;
  readonly expected: readonly GateReasonCode[];
}[] = [
  {
    label: 'CATEGORY_NOT_CAPTURED + ENTITY_UNLICENSED',
    patch: {
      kind: 'CATEGORY_ONLY',
      tabaqa: null,
      line: 'NA',
      category: null,
      disbursingEntity: { ...UNLICENSED_ENTITY },
    },
    expected: ['CATEGORY_NOT_CAPTURED', 'ENTITY_UNLICENSED'],
  },
  {
    label: 'CATEGORY_NOT_CAPTURED + STALE_KYC',
    patch: {
      kind: 'CATEGORY_ONLY',
      tabaqa: null,
      line: 'NA',
      category: '',
      kycLastRefreshed: '2025-06-01',
    },
    expected: ['CATEGORY_NOT_CAPTURED', 'STALE_KYC'],
  },
  {
    label: 'CATEGORY_NOT_CAPTURED + KYC_UNVERIFIED',
    patch: {
      kind: 'CATEGORY_ONLY',
      tabaqa: null,
      line: 'NA',
      category: null,
      verificationStatus: 'PENDING',
      kycLastRefreshed: null,
    },
    expected: ['CATEGORY_NOT_CAPTURED', 'KYC_UNVERIFIED'],
  },
  {
    label: 'CATEGORY_NOT_CAPTURED + CROSS_BORDER_PENDING',
    patch: {
      kind: 'CATEGORY_ONLY',
      tabaqa: null,
      line: 'NA',
      category: null,
      residency: 'CROSS_BORDER',
    },
    expected: ['CATEGORY_NOT_CAPTURED', 'CROSS_BORDER_PENDING'],
  },
  {
    label: 'ENTITY_UNLICENSED + STALE_KYC',
    patch: { disbursingEntity: { ...UNLICENSED_ENTITY }, kycLastRefreshed: '2025-06-01' },
    expected: ['ENTITY_UNLICENSED', 'STALE_KYC'],
  },
  {
    label: 'ENTITY_UNLICENSED + KYC_UNVERIFIED',
    patch: {
      disbursingEntity: { ...UNLICENSED_ENTITY },
      verificationStatus: 'UNVERIFIED',
      kycLastRefreshed: null,
    },
    expected: ['ENTITY_UNLICENSED', 'KYC_UNVERIFIED'],
  },
  {
    label: 'ENTITY_UNLICENSED + CROSS_BORDER_PENDING',
    patch: { disbursingEntity: { ...UNLICENSED_ENTITY }, residency: 'CROSS_BORDER' },
    expected: ['ENTITY_UNLICENSED', 'CROSS_BORDER_PENDING'],
  },
  {
    label: 'STALE_KYC + KYC_UNVERIFIED (pending verification on an already-expired date)',
    patch: { verificationStatus: 'PENDING', kycLastRefreshed: '2025-06-01' },
    expected: ['STALE_KYC', 'KYC_UNVERIFIED'],
  },
  {
    label: 'STALE_KYC + CROSS_BORDER_PENDING (§08 line 129, AT-10)',
    patch: { kycLastRefreshed: '2025-06-01', residency: 'CROSS_BORDER' },
    expected: ['STALE_KYC', 'CROSS_BORDER_PENDING'],
  },
  {
    label: 'KYC_UNVERIFIED + CROSS_BORDER_PENDING',
    patch: { verificationStatus: 'PENDING', kycLastRefreshed: null, residency: 'CROSS_BORDER' },
    expected: ['KYC_UNVERIFIED', 'CROSS_BORDER_PENDING'],
  },
  {
    label: 'four gates at once (AT-10)',
    patch: {
      kind: 'CATEGORY_ONLY',
      tabaqa: null,
      line: 'NA',
      category: null,
      disbursingEntity: { ...UNLICENSED_ENTITY },
      verificationStatus: 'UNVERIFIED',
      kycLastRefreshed: null,
      residency: 'CROSS_BORDER',
    },
    expected: [
      'CATEGORY_NOT_CAPTURED',
      'ENTITY_UNLICENSED',
      'KYC_UNVERIFIED',
      'CROSS_BORDER_PENDING',
    ],
  },
  {
    label: 'all five gates at once',
    patch: {
      kind: 'CATEGORY_ONLY',
      tabaqa: null,
      line: 'NA',
      category: '   ',
      disbursingEntity: { name: 'Fake Jiha', licensed: true, licenceExpiry: '2020-01-01' },
      verificationStatus: 'UNVERIFIED',
      kycLastRefreshed: '2025-06-01',
      residency: 'CROSS_BORDER',
    },
    expected: [
      'CATEGORY_NOT_CAPTURED',
      'ENTITY_UNLICENSED',
      'STALE_KYC',
      'KYC_UNVERIFIED',
      'CROSS_BORDER_PENDING',
    ],
  },
];

describe('precedence — the most restrictive gate wins the status, ALL tripped gates are recorded', () => {
  for (const { label, patch, expected } of COMBINATIONS) {
    it(`${label}: reports every flag and binds on the highest-precedence one`, () => {
      const outcome = gates(patch);
      const expectedFlags = inPrecedenceOrder(expected);

      // The complete evidence set, in precedence order. A dropped flag is lost evidence.
      expect(outcome.gateFlags).toEqual(expectedFlags);
      // The binding reason is the first tripped gate in precedence order.
      expect(outcome.reasonCode).toBe(expectedFlags[0]);
      // Cross-border alone routes; anything else present blocks.
      expect(outcome.status).toBe(
        expectedFlags[0] === 'CROSS_BORDER_PENDING' ? 'CROSS_BORDER_PENDING' : 'WITHHELD',
      );
    });
  }

  it('the all-five case reproduces GATE_PRECEDENCE exactly', () => {
    const allFive = COMBINATIONS[COMBINATIONS.length - 1];
    if (allFive === undefined) throw new Error('COMBINATIONS must not be empty');
    expect(gates(allFive.patch).gateFlags).toEqual([...GATE_PRECEDENCE]);
  });

  it('covers every pair of gates that can co-occur', () => {
    // Guards the table itself: if a gate reason is added, C(n,2) grows and this fails until the
    // pairwise cases are extended. 5 gates ⇒ 10 pairs.
    const pairs = new Set<string>();
    for (const { expected } of COMBINATIONS) {
      for (const a of expected) {
        for (const b of expected) {
          if (a < b) pairs.add(`${a}|${b}`);
        }
      }
    }
    const n = GATE_PRECEDENCE.length;
    expect(pairs.size).toBe((n * (n - 1)) / 2);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * I6 — a gate cannot touch an amount
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('I6 · withhold never reallocates', () => {
  /** Every key reachable in a value, recursively. */
  function keysOf(value: unknown, into: Set<string> = new Set()): Set<string> {
    if (Array.isArray(value)) {
      for (const item of value) keysOf(item, into);
      return into;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, nested] of Object.entries(value)) {
        into.add(key);
        keysOf(nested, into);
      }
    }
    return into;
  }

  it('a GateOutcome carries exactly three fields, none of them monetary', () => {
    // The runtime half of the type-level proof: `Minor` appears nowhere in gates.ts, so no amount
    // can ride out of stage 3. If a future author adds `entitledMinor` (or any amount) to the
    // outcome, I6 has stopped being structural and this test says so.
    for (const patch of [{}, { residency: 'CROSS_BORDER' as const }, { kycLastRefreshed: null }]) {
      const keys = keysOf(gates(patch));
      expect([...keys].sort()).toEqual(['gateFlags', 'reasonCode', 'status']);
      for (const key of keys) {
        expect(key).not.toMatch(/minor|amount|halala|riyal|sar\b|share|weight|total/i);
      }
    }
  });

  it('is a pure function of its arguments — same input, deep-equal output', () => {
    const beneficiary = ben({ kycLastRefreshed: '2025-06-01', residency: 'CROSS_BORDER' });
    const first = evaluateGates({ beneficiary, asOfGregorian: ASOF, kycRefreshMonths: KYC_MONTHS });
    const second = evaluateGates({
      beneficiary,
      asOfGregorian: ASOF,
      kycRefreshMonths: KYC_MONTHS,
    });
    expect(first).toStrictEqual(second);
    expect(first).not.toBe(second);
  });

  it('does not mutate the beneficiary it is handed', () => {
    const beneficiary = Object.freeze(ben({ verificationStatus: 'PENDING' }));
    const snapshot = JSON.stringify(beneficiary);
    expect(() =>
      evaluateGates({ beneficiary, asOfGregorian: ASOF, kycRefreshMonths: KYC_MONTHS }),
    ).not.toThrow();
    expect(JSON.stringify(beneficiary)).toBe(snapshot);
  });

  it('carries no state between beneficiaries — one blocked line cannot affect the next', () => {
    // Order-independence. If stage 3 held any accumulator, evaluating a gated line first would
    // change the clean line's verdict — which is precisely how a withheld share leaks to a sibling.
    const blocked = { kycLastRefreshed: '2025-06-01' } as const;
    const cleanFirst = [gates(), gates(blocked)];
    const blockedFirst = [gates(blocked), gates()];
    expect(cleanFirst[0]).toStrictEqual(blockedFirst[1]);
    expect(cleanFirst[1]).toStrictEqual(blockedFirst[0]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Worked examples — the gate verdicts the sibling suites depend on
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('worked examples (S3 brief) — stage-3 verdicts', () => {
  it('A · ben-001 VERIFIED 2026-01-15 domestic ⇒ PAID', () => {
    expect(gates({ id: 'ben-001', kycLastRefreshed: '2026-01-15' }).status).toBe('PAID');
  });

  it('A · ben-003 PENDING, no KYC date ⇒ WITHHELD / KYC_UNVERIFIED', () => {
    expect(
      gates({
        id: 'ben-003',
        line: 'BUTUN',
        branch: 'Branch B',
        verificationStatus: 'PENDING',
        kycLastRefreshed: null,
      }),
    ).toEqual({
      status: 'WITHHELD',
      reasonCode: 'KYC_UNVERIFIED',
      gateFlags: ['KYC_UNVERIFIED'],
    });
  });

  it('B · ben-004 VERIFIED 2025-12-01 ⇒ PAID; ben-005 UNVERIFIED, no date ⇒ KYC_UNVERIFIED', () => {
    expect(gates({ id: 'ben-004', kycLastRefreshed: '2025-12-01' }).status).toBe('PAID');
    expect(
      gates({ id: 'ben-005', verificationStatus: 'UNVERIFIED', kycLastRefreshed: null }).reasonCode,
    ).toBe('KYC_UNVERIFIED');
  });

  it('D · ben-006 licensed jiha ⇒ PAID; flip `licensed` to false ⇒ WITHHELD / ENTITY_UNLICENSED', () => {
    const jiha: Partial<BeneficiaryRaw> = {
      id: 'ben-006',
      kind: 'CHARITABLE_JIHA',
      tabaqa: null,
      line: 'NA',
      branch: 'Charitable',
      stipulatedWeight: '40',
      kycLastRefreshed: '2026-03-05',
      disbursingEntity: { name: 'Fake Jiha', licensed: true, licenceExpiry: '2027-06-30' },
    };
    expect(gates(jiha).status).toBe('PAID');
    expect(gates({ ...jiha, disbursingEntity: { ...UNLICENSED_ENTITY } })).toEqual({
      status: 'WITHHELD',
      reasonCode: 'ENTITY_UNLICENSED',
      gateFlags: ['ENTITY_UNLICENSED'],
    });
  });

  it('D · ben-008 verified but cross-border ⇒ CROSS_BORDER_PENDING (routed, entitlement intact)', () => {
    expect(
      gates({
        id: 'ben-008',
        line: 'BUTUN',
        branch: 'Branch B',
        stipulatedWeight: '30',
        kycLastRefreshed: '2026-04-01',
        residency: 'CROSS_BORDER',
      }),
    ).toEqual({
      status: 'CROSS_BORDER_PENDING',
      reasonCode: 'CROSS_BORDER_PENDING',
      gateFlags: ['CROSS_BORDER_PENDING'],
    });
  });

  it('E · ben-001 with KYC 2025-06-01 ⇒ WITHHELD / STALE_KYC (the all-lines-gated state)', () => {
    expect(gates({ id: 'ben-001', kycLastRefreshed: '2025-06-01' })).toEqual({
      status: 'WITHHELD',
      reasonCode: 'STALE_KYC',
      gateFlags: ['STALE_KYC'],
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The human-readable reason (BR-505)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('gate reason text', () => {
  it('gives every gate reason a non-empty developer-facing English reason', () => {
    // BR-505: a beneficiary in a dispute reads a reason, not only a code. The Arabic (authoritative,
    // NFR-01) renders from the machine code; this is the `DomainError.message` twin and the single
    // source for `AuthorityNotice.reason`.
    for (const code of GATE_REASON_CODES) {
      expect(gateReasonText(code).trim().length).toBeGreaterThan(20);
      expect(GATE_REASON_TEXT[code]).toBe(gateReasonText(code));
    }
    expect(Object.keys(GATE_REASON_TEXT).sort()).toEqual([...GATE_REASON_CODES].sort());
  });

  it('says cross-border is routed, not refused', () => {
    expect(gateReasonText('CROSS_BORDER_PENDING')).toMatch(/routed/i);
    expect(gateReasonText('CROSS_BORDER_PENDING')).toMatch(/entitlement is unchanged/i);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Properties — the invariants a hand-written case cannot cover
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('properties', () => {
  /** A civil date within ±10 years of a base, built with the one in-package date engine. */
  const dateNear = (base: CivilDate): fc.Arbitrary<CivilDate> =>
    fc.integer({ min: -3650, max: 3650 }).map((offset) => addCalendarDays(base, offset));

  const patchArb: fc.Arbitrary<Partial<BeneficiaryRaw>> = fc.record({
    kind: fc.constantFrom(...BENEFICIARY_KINDS),
    category: fc.constantFrom(null, '', '   ', 'orphans of the district'),
    verificationStatus: fc.constantFrom(...VERIFICATION_STATUSES),
    kycLastRefreshed: fc.oneof(fc.constant(null), dateNear(ASOF)),
    residency: fc.constantFrom(...RESIDENCIES),
    disbursingEntity: fc.oneof(
      fc.constant(null),
      fc.record({
        name: fc.constant('Fake Jiha'),
        licensed: fc.boolean(),
        licenceExpiry: fc.oneof(fc.constant(null), dateNear(ASOF)),
      }),
    ),
  });

  /** A `tabaqa`/`line` pair the schema accepts for any kind (kind is generated independently). */
  const normalise = (patch: Partial<BeneficiaryRaw>): Partial<BeneficiaryRaw> =>
    patch.kind === 'FAMILY' ? patch : { ...patch, tabaqa: null, line: 'NA' };

  const monthsArb = fc.integer({ min: 0, max: 600 });

  it('status and flags are always coherent', () => {
    fc.assert(
      fc.property(patchArb, monthsArb, (patch, months) => {
        const outcome = gates(normalise(patch), months);

        // PAID ⟺ nothing tripped.
        expect(outcome.status === 'PAID').toBe(outcome.gateFlags.length === 0);
        // The reason is always the first tripped gate, or null.
        expect(outcome.reasonCode).toBe(outcome.gateFlags[0] ?? null);
        // Flags are a duplicate-free subset of the precedence list, IN precedence order.
        expect(new Set(outcome.gateFlags).size).toBe(outcome.gateFlags.length);
        expect(outcome.gateFlags).toEqual(inPrecedenceOrder(outcome.gateFlags));
        // Routing happens only when nothing blocks; every other tripped state withholds.
        expect(outcome.status === 'CROSS_BORDER_PENDING').toBe(
          outcome.gateFlags.length === 1 && outcome.gateFlags[0] === 'CROSS_BORDER_PENDING',
        );
      }),
      { numRuns: 2_000, seed: 20260730 },
    );
  });

  it('the two KYC codes are never both the only explanation of one condition', () => {
    fc.assert(
      fc.property(patchArb, monthsArb, (patch, months) => {
        const beneficiary = ben(normalise(patch));
        // A missing evidence date is UNVERIFIED, never STALE — the codes must stay disjoint on null.
        if (beneficiary.kycLastRefreshed === null) {
          expect(isKycStale(null, ASOF, months)).toBe(false);
          expect(isKycUnverified(beneficiary)).toBe(true);
        }
        // And a VERIFIED record with a date is never reported as unverified.
        if (
          beneficiary.verificationStatus === 'VERIFIED' &&
          beneficiary.kycLastRefreshed !== null
        ) {
          expect(isKycUnverified(beneficiary)).toBe(false);
        }
      }),
      { numRuns: 1_000, seed: 20260730 },
    );
  });

  it('adding a defect NEVER unblocks a line — the flag set only grows', () => {
    // The adversary's dream is a record where adding a problem makes it payable. Each of these
    // patches is additive (it touches only its own gate's inputs), so the flag set must be a
    // superset and a WITHHELD line can never become PAID.
    const additive: readonly Partial<BeneficiaryRaw>[] = [
      { residency: 'CROSS_BORDER' },
      { disbursingEntity: { ...UNLICENSED_ENTITY } },
      { kind: 'CATEGORY_ONLY', tabaqa: null, line: 'NA', category: null },
      { verificationStatus: 'UNVERIFIED' },
    ];

    fc.assert(
      fc.property(patchArb, monthsArb, fc.nat({ max: additive.length - 1 }), (patch, months, i) => {
        const base = normalise(patch);
        const extra = additive[i];
        if (extra === undefined) throw new Error('additive patch index out of range');

        const before = gates(base, months);
        const after = gates({ ...base, ...extra }, months);

        for (const flag of before.gateFlags) {
          expect(after.gateFlags).toContain(flag);
        }
        if (before.status !== 'PAID') {
          expect(after.status).not.toBe('PAID');
        }
      }),
      { numRuns: 2_000, seed: 20260730 },
    );
  });

  it('a longer refresh window can never CREATE staleness', () => {
    // Monotonicity in the window. A sign flip or an inverted comparison fails immediately.
    fc.assert(
      fc.property(dateNear(ASOF), monthsArb, monthsArb, (refreshed, a, b) => {
        const shorter = Math.min(a, b);
        const longer = Math.max(a, b);
        if (isKycStale(refreshed, ASOF, longer)) {
          expect(isKycStale(refreshed, ASOF, shorter)).toBe(true);
        }
      }),
      { numRuns: 2_000, seed: 20260730 },
    );
  });

  it('once stale, always stale — staleness is monotonic in asOf', () => {
    fc.assert(
      fc.property(
        dateNear(ASOF),
        monthsArb,
        fc.integer({ min: 0, max: 3650 }),
        (refreshed, months, forward) => {
          if (isKycStale(refreshed, ASOF, months)) {
            expect(isKycStale(refreshed, addCalendarDays(ASOF, forward), months)).toBe(true);
          }
        },
      ),
      { numRuns: 2_000, seed: 20260730 },
    );
  });

  it('a licence is unexpired exactly while its expiry is not before asOf', () => {
    fc.assert(
      fc.property(dateNear(ASOF), fc.boolean(), (expiry, licensed) => {
        const unlicensed = isEntityUnlicensed(
          { name: 'Fake Jiha', licensed, licenceExpiry: expiry },
          ASOF,
        );
        expect(unlicensed).toBe(!licensed || expiry < ASOF);
      }),
      { numRuns: 1_000, seed: 20260730 },
    );
  });
});
