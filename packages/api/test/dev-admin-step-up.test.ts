// The local development administrator's step-up carve-out — pure, and bounded on every side:
// fixture-only, exact email, stale-only. Maker≠checker is NOT carved out, and a test says so.

import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/errors.js';
import {
  assertDistinctApprover,
  evaluateStepUp,
  selfCheckCarveOutApplies,
  stepUpRefusalFor,
} from '../src/middleware/segregation.js';

const ADMIN = 'arshad@alfarooque.com';
const FIXTURE = { DATA_CLASSIFICATION: 'fixture-only', DEV_ADMIN_EMAIL: ADMIN } as const;
const NOW = new Date('2026-09-30T12:00:00.000Z');
const STALE = new Date(NOW.getTime() - 3 * 60 * 60 * 1000); // three hours old
const FRESH = new Date(NOW.getTime() - 30 * 1000);
const WINDOW = 600;

describe('stepUpRefusalFor — the dev admin approves without a fresh assertion, fixture-only', () => {
  it('passes the dev admin on a STALE assertion under fixture-only', () => {
    expect(evaluateStepUp({ assertedAt: STALE, windowSeconds: WINDOW, now: NOW })).toBe('EXPIRED');
    expect(
      stepUpRefusalFor({ email: ADMIN, totpAssertedAt: STALE }, WINDOW, NOW, FIXTURE),
    ).toBeNull();
  });

  it('passes the dev admin when the window setting is missing or invalid (the fail-closed refusals other callers get)', () => {
    expect(
      stepUpRefusalFor({ email: ADMIN, totpAssertedAt: FRESH }, null, NOW, FIXTURE),
    ).toBeNull();
    expect(
      stepUpRefusalFor(
        { email: ADMIN, totpAssertedAt: new Date('nonsense') },
        WINDOW,
        NOW,
        FIXTURE,
      ),
    ).toBeNull();
  });

  it('STILL refuses the dev admin with NO assertion — nothing real to record on the approval', () => {
    expect(stepUpRefusalFor({ email: ADMIN, totpAssertedAt: null }, WINDOW, NOW, FIXTURE)).toBe(
      'NO_ASSERTION',
    );
  });

  it('is disabled by any classification other than fixture-only', () => {
    for (const classification of ['production', 'staging', undefined, '']) {
      const env = { ...FIXTURE, DATA_CLASSIFICATION: classification };
      expect(stepUpRefusalFor({ email: ADMIN, totpAssertedAt: STALE }, WINDOW, NOW, env)).toBe(
        'EXPIRED',
      );
    }
  });

  it('is disabled when DEV_ADMIN_EMAIL is absent, and never matches another or a near-identical email', () => {
    expect(
      stepUpRefusalFor({ email: ADMIN, totpAssertedAt: STALE }, WINDOW, NOW, {
        DATA_CLASSIFICATION: 'fixture-only',
      }),
    ).toBe('EXPIRED');
    for (const other of [
      'nazir@example.test',
      'approver@example.test',
      'Arshad@alfarooque.com',
      `${ADMIN} `,
      'x' + ADMIN,
    ]) {
      expect(stepUpRefusalFor({ email: other, totpAssertedAt: STALE }, WINDOW, NOW, FIXTURE)).toBe(
        'EXPIRED',
      );
    }
  });

  it('leaves every other caller on evaluateStepUp’s exact verdict', () => {
    const nazir = { email: 'nazir@example.test', totpAssertedAt: FRESH };
    expect(stepUpRefusalFor(nazir, WINDOW, NOW, FIXTURE)).toBeNull();
    expect(stepUpRefusalFor({ ...nazir, totpAssertedAt: STALE }, WINDOW, NOW, FIXTURE)).toBe(
      'EXPIRED',
    );
    expect(stepUpRefusalFor({ ...nazir, totpAssertedAt: null }, WINDOW, NOW, FIXTURE)).toBe(
      'NO_ASSERTION',
    );
    expect(stepUpRefusalFor(nazir, null, NOW, FIXTURE)).toBe('SETTING_MISSING');
  });
});

describe('maker ≠ checker — the application pre-check and its fixture-only carve-out (migration 54)', () => {
  const admin = { email: ADMIN, userId: 'user-dev-admin' };
  const nazir = { email: 'nazir@example.test', userId: 'user-nazir-001' };

  it('assertDistinctApprover itself is unchanged: it refuses every self-checker', () => {
    for (const userId of ['user-dev-admin', 'user-nazir-001']) {
      expect(() =>
        assertDistinctApprover({ initiatedByUserId: userId, approverUserId: userId }),
      ).toThrow(ApiError);
    }
    expect(() =>
      assertDistinctApprover({
        initiatedByUserId: 'user-nazir-001',
        approverUserId: 'user-dev-admin',
      }),
    ).not.toThrow();
  });

  it('the carve-out applies to the dev admin deciding THEIR OWN request under fixture-only', () => {
    expect(selfCheckCarveOutApplies(admin, 'user-dev-admin', 'user-dev-admin', FIXTURE)).toBe(true);
  });

  it('the carve-out does not apply outside fixture-only, to another email, or to a mismatched identity', () => {
    for (const classification of ['production', 'staging', '', undefined]) {
      expect(
        selfCheckCarveOutApplies(admin, 'user-dev-admin', 'user-dev-admin', {
          ...FIXTURE,
          DATA_CLASSIFICATION: classification,
        }),
      ).toBe(false);
    }
    expect(selfCheckCarveOutApplies(nazir, 'user-nazir-001', 'user-nazir-001', FIXTURE)).toBe(
      false,
    );
    // The session's email is the admin's but the approver id is somebody else's: no carve-out.
    expect(selfCheckCarveOutApplies(admin, 'user-nazir-001', 'user-nazir-001', FIXTURE)).toBe(
      false,
    );
    // A distinct approver never needs one.
    expect(selfCheckCarveOutApplies(admin, 'user-nazir-001', 'user-dev-admin', FIXTURE)).toBe(
      false,
    );
    expect(selfCheckCarveOutApplies(admin, 'user-dev-admin', null, FIXTURE)).toBe(false);
  });
});
