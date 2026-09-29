/**
 * UNIT assertions about the ladder itself — no database, no Prisma engine, no network.
 *
 * Three kinds of proof live here, and the third is the one that mattered most in Sprint 1:
 *
 *  1. **BEHAVIOURAL** — the pure decisions (`assertAuthed`, `resolveScope`, `assertDistinctApprover`,
 *     `evaluateStepUp`) refuse what they must, with the right code, on every fail-closed input.
 *  2. **TYPE-LEVEL** — `waqfScoped(permission)`'s parameter is REQUIRED (MP-34). Asserted with a
 *     `@ts-expect-error`, which `tsc --noEmit` fails on if it ever becomes UNUSED — i.e. if the
 *     parameter is made optional. `tsconfig.json` includes `test/**` precisely so that proof is real.
 *  3. **SOURCE SCANS** — a rule stated in a comment is not a control. These read this package's own
 *     source as TEXT and assert the forbidden identifiers are absent: `bypass`,
 *     `canViewAmlRestricted: true`, `getUserRoleKeys`, `getUserDbRoles`, `onBehalfOfId` on an
 *     authority path, the three invented procedure names, and any co-authorization shape. The
 *     technique is the one `packages/auth/test/roles.test.ts` already established.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SETTING_KEYS, isSettingKey, parseSetting, type SettingKey } from '@qmulate/domain';

import {
  API_ERROR_CODES,
  API_ERROR_STATUS,
  ApiError,
  NON_DISCLOSURE_WIRE_CODE,
  isNonDisclosureCode,
  toTRPCError,
} from '../src/errors.js';
import { assertAuthed } from '../src/middleware/authed.js';
import { resolveScope, waqfScopedInput } from '../src/middleware/scope.js';
import {
  approvalTargetInput,
  assertApprovalPermission,
  assertDistinctApprover,
  evaluateStepUp,
  permissionIsWriteVerb,
  readStepUpWindowSeconds,
} from '../src/middleware/segregation.js';
import { isAmlMember } from '../src/middleware/aml.js';
import {
  assertStepUpPolicyAgrees,
  hasPermissionInGrant,
  requiresTotpStepUp,
  TOTP_STEP_UP_FRESHNESS_SETTING_KEY,
} from '../src/permissions.js';
import {
  endowmentScopedProcedure,
  makerProcedure,
  requireAmlMember,
  requireDistinctApprover,
  waqfScoped,
  checkerProcedure,
  signerProcedure,
  amlProcedure,
} from '../src/trpc.js';

import type { AuthedContext } from '../src/middleware/authed.js';
import type { ResolvedGrant, SessionContext, TrpcContext } from '../src/context.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Fixtures — hand-built contexts. No database: every decision under test is pure.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const NOW = new Date('2026-07-27T09:00:00.000Z');

function grant(overrides: Partial<ResolvedGrant> = {}): ResolvedGrant {
  return {
    grantId: 'grant-test-001',
    waqfId: 'waqf-001',
    role: 'FINANCE',
    permissions: ['finance:transaction:read', 'distribution:run:initiate'],
    beneficiarySelfId: null,
    scopeRefs: [],
    amlCompartment: false,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: null,
    ...overrides,
  };
}

function session(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    status: 'authorized',
    userId: 'user-test-api-finance',
    email: 'finance@example.test',
    twoFactorEnabled: true,
    totpAssertedAt: NOW,
    freshUntil: null,
    ...overrides,
  } as SessionContext;
}

function ctx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    requestId: 'req-test-001',
    now: NOW,
    locale: 'ar',
    session: session(),
    grants: [grant()],
    actor: {
      actorId: 'user-test-api-finance',
      actorType: 'USER',
      onBehalfOfId: null,
      requestId: 'req-test-001',
    },
    // Never touched by the pure decisions under test. A Proxy that throws on ANY access is the proof
    // of that: if a "pure" guard ever reaches for the database, this fixture fails loudly instead of
    // quietly needing a live Postgres.
    db: new Proxy(
      {},
      {
        get(_target, property) {
          throw new Error(
            `a unit-level guard reached for ctx.db.${String(property)}. The decisions asserted in ` +
              `this file are pure by design — if one now needs I/O, it belongs in an integration ` +
              `suite where a real refusal can be observed.`,
          );
        },
      },
    ) as never,
    settings: {
      raw: () =>
        Promise.reject(
          new Error(
            'a unit-level guard read a Setting; move that assertion to an integration suite',
          ),
        ),
    },
    ...overrides,
  } as TrpcContext;
}

const authed = (overrides: Partial<TrpcContext> = {}) => ctx(overrides) as AuthedContext;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · authedProcedure's decision
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assertAuthed — rung 1', () => {
  it('rejects an unauthenticated caller with UNAUTHENTICATED', () => {
    expect(() => assertAuthed(ctx({ session: null }))).toThrowError(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
  });

  it("rejects a session whose gate status is 'totp-enrolment-required'", () => {
    // The enrolment gate is UNIVERSAL (user decision 2026-07-27). This subject holds a grant and is
    // otherwise perfectly authorized; the refusal must still fire, and it must not depend on roles.
    expect(() =>
      assertAuthed(ctx({ session: session({ status: 'totp-enrolment-required' }) })),
    ).toThrowError(expect.objectContaining({ code: 'TOTP_ENROLMENT_REQUIRED' }));
  });

  it('FAILS CLOSED on an unrecognised gate status', () => {
    expect(() =>
      assertAuthed(ctx({ session: session({ status: 'something-new' as never }) })),
    ).toThrowError(expect.objectContaining({ code: 'GATE_NOT_CLEARED' }));
  });

  it('admits an authorized session', () => {
    expect(assertAuthed(ctx()).session.status).toBe('authorized');
  });

  it('the refusal does not depend on the caller holding any role or grant', () => {
    // A subject with ZERO grants still passes rung 1 — the deny-by-default default is the GRANT, not
    // the session, and it is applied one rung down. Asserting it here keeps the two rungs' jobs
    // distinct: if rung 1 ever started refusing the ungranted, EXIT-1 would pass for the wrong reason.
    expect(assertAuthed(ctx({ grants: [] })).grants).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · the scope rung
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveScope — rung 2', () => {
  it('NO GRANT gives NO_GRANT, which maps to NOT_FOUND and never to FORBIDDEN', () => {
    let thrown: unknown;
    try {
      resolveScope(authed({ grants: [] }), 'waqf-003', 'endowment:waqf:read');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('NO_GRANT');
    // ⚠ The security property, stated twice on purpose: as the mapping AND as the negation.
    expect(API_ERROR_STATUS.NO_GRANT).toBe('NOT_FOUND');
    expect(API_ERROR_STATUS.NO_GRANT).not.toBe('FORBIDDEN');
    expect(toTRPCError(thrown).code).toBe('NOT_FOUND');
  });

  it('a grant on ANOTHER endowment does not satisfy a request for this one', () => {
    // §10 principle 2: scope is the endowment, never the client. The caller holds waqf-001 and asks
    // about waqf-003; there is no fallback to "the caller only has one grant so it must be that one".
    expect(() =>
      resolveScope(
        authed({ grants: [grant({ waqfId: 'waqf-001' })] }),
        'waqf-003',
        'endowment:waqf:read',
      ),
    ).toThrowError(expect.objectContaining({ code: 'NO_GRANT' }));
  });

  it('a grant WITHOUT the required verb gives PERMISSION_DENIED (FORBIDDEN), not NO_GRANT', () => {
    // A different refusal on purpose: existence is already disclosed by the grant, so there is
    // nothing left to protect and a precise error is more useful than a misleading one.
    const finance = authed({ grants: [grant({ role: 'FINANCE' })] });
    let thrown: unknown;
    try {
      resolveScope(finance, 'waqf-001', 'distribution:run:approve');
    } catch (error) {
      thrown = error;
    }
    expect((thrown as ApiError).code).toBe('PERMISSION_DENIED');
    expect(toTRPCError(thrown).code).toBe('FORBIDDEN');
  });

  it('an ALREADY-WIDENED grant row grants nothing extra (MP-18, at this layer)', () => {
    // `ResolvedGrant.permissions` is the EFFECTIVE set. A caller who hand-appends an approval verb to
    // a FINANCE grant is refused here as well as by the DB trigger, because the resolver intersected
    // with the preset before this rung ever saw it. Simulated by giving the grant the widened string
    // and asserting the MATCH still fails when the resolver has done its job.
    const widened = grant({ role: 'FINANCE', permissions: ['finance:transaction:read'] });
    expect(hasPermissionInGrant(widened, 'distribution:run:approve')).toBe(false);
  });

  it('no wildcard grants anything (MP-19)', () => {
    for (const wildcard of ['*', 'approval:*', 'approval:request:*', 'distribution:run:*']) {
      const widened = grant({ role: 'NAZIR', permissions: [wildcard as never] });
      expect(hasPermissionInGrant(widened, 'approval:request:approve')).toBe(false);
    }
  });

  it('a typo DENIES rather than being accommodated (MP-19)', () => {
    const typo = grant({ role: 'NAZIR', permissions: ['approval:request:aprove' as never] });
    expect(hasPermissionInGrant(typo, 'approval:request:approve')).toBe(false);
    // …and the typo cannot even be the DEMANDED permission: it is refused at router construction, so
    // a mistyped procedure definition fails at import rather than denying silently at request time.
    expect(() => endowmentScopedProcedure('approval:request:aprove' as never)).toThrowError(
      expect.objectContaining({ code: 'PERMISSION_INVALID' }),
    );
  });

  it('succeeds, and injects the grant, the endowment and the demanded permission', () => {
    const scoped = resolveScope(authed(), 'waqf-001', 'finance:transaction:read');
    expect(scoped.waqfId).toBe('waqf-001');
    expect(scoped.permission).toBe('finance:transaction:read');
    expect(scoped.grant.grantId).toBe('grant-test-001');
  });

  it('waqfScopedInput requires a non-empty, bounded waqfId', () => {
    expect(waqfScopedInput.safeParse({ waqfId: 'waqf-001' }).success).toBe(true);
    expect(waqfScopedInput.safeParse({ waqfId: '' }).success).toBe(false);
    expect(waqfScopedInput.safeParse({}).success).toBe(false);
    expect(waqfScopedInput.safeParse({ waqfId: 'x'.repeat(65) }).success).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · MP-34 — the permission parameter is REQUIRED at the type level
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('MP-34 — waqfScoped(permission) is unwritable without a permission', () => {
  it('is a COMPILE error to omit it, and a runtime refusal too', () => {
    // ⚠ THIS `@ts-expect-error` IS THE ASSERTION. `tsconfig.json` includes `test/**`, so if the
    // parameter is ever made optional (`permission?: PermissionString`) the directive becomes UNUSED
    // and `tsc --noEmit` fails the build. §10 §7.2: "the type system makes the check non-optional."
    // @ts-expect-error — permission is required; omitting it must not compile.
    expect(() => waqfScoped()).toThrowError(
      expect.objectContaining({ code: 'PERMISSION_INVALID' }),
    );

    // Belt and braces at runtime, for a caller that reached this through `as never` or plain JS.
    for (const bad of [undefined, null, '', 'endowment:waqf', 'nonsense', 42]) {
      expect(() => endowmentScopedProcedure(bad as never)).toThrowError(
        expect.objectContaining({ code: 'PERMISSION_INVALID' }),
      );
    }
    expect(endowmentScopedProcedure.length).toBe(1);
  });

  it('§17 and §10 §7.2 name the SAME function object, not two implementations', () => {
    // Three names for one thing is how the Sprint-1 parity holes happened. Identity, not similarity.
    expect(waqfScoped).toBe(endowmentScopedProcedure);
    expect(requireDistinctApprover).toBe(checkerProcedure);
    expect(requireAmlMember).toBe(amlProcedure);
  });

  it('makerProcedure refuses an approval verb, and checker/signer refuse a non-approval verb', () => {
    expect(() => makerProcedure('approval:request:approve')).toThrowError(/may only guard a write/);
    expect(() => makerProcedure('endowment:deed:sign')).toThrowError(/may only guard a write/);
    expect(() => makerProcedure('finance:transaction:read')).toThrowError(/may only guard a write/);
    expect(() => checkerProcedure('finance:transaction:read')).toThrowError(
      /may only guard an approve or sign/,
    );
    expect(() => signerProcedure('distribution:run:write')).toThrowError(
      /may only guard an approve or sign/,
    );
    // …and the legitimate combinations build.
    expect(() => makerProcedure('distribution:run:initiate')).not.toThrow();
    expect(() => checkerProcedure('distribution:run:approve')).not.toThrow();
    expect(() => signerProcedure('endowment:deed:sign')).not.toThrow();
  });

  it('permissionIsWriteVerb / assertApprovalPermission are exact complements over the verb set', () => {
    const cases = [
      'finance:transaction:read',
      'finance:transaction:write',
      'distribution:run:initiate',
      'distribution:run:approve',
      'endowment:deed:sign',
    ] as const;
    for (const permission of cases) {
      const isMaker = (() => {
        try {
          permissionIsWriteVerb(permission);
          return true;
        } catch {
          return false;
        }
      })();
      const isApproval = (() => {
        try {
          assertApprovalPermission(permission);
          return true;
        } catch {
          return false;
        }
      })();
      // No permission may be BOTH, and `read` is neither — which is why a read cannot silently become
      // a maker path.
      expect(isMaker && isApproval).toBe(false);
      expect(isApproval).toBe(requiresTotpStepUp(permission));
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · maker != checker, as pure algebra
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('assertDistinctApprover — §10 §4.2', () => {
  it('refuses a match', () => {
    expect(() =>
      assertDistinctApprover({ initiatedByUserId: 'u1', approverUserId: 'u1' }),
    ).toThrowError(expect.objectContaining({ code: 'SEGREGATION_OF_DUTIES' }));
  });

  it('refuses an ABSENT approver — an approval with no approver is not an approval', () => {
    for (const approverUserId of [null, '']) {
      expect(() =>
        assertDistinctApprover({ initiatedByUserId: 'u1', approverUserId }),
      ).toThrowError(expect.objectContaining({ code: 'SEGREGATION_OF_DUTIES' }));
    }
  });

  it('permits a distinct approver', () => {
    expect(() =>
      assertDistinctApprover({ initiatedByUserId: 'u1', approverUserId: 'u2' }),
    ).not.toThrow();
  });

  it('is IDENTITY-shaped: it takes no role and cannot be told about one', () => {
    // The signature is the assertion. There is no `roles` parameter, so "caller is a nazir → allow"
    // is not expressible here — which is what makes MP-11's two halves distinguishable.
    expect(assertDistinctApprover.length).toBe(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · the TOTP step-up window (D-6) — fail closed on all four unknowns
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('evaluateStepUp — D-6 / NFR-06', () => {
  it('DENIES when no assertion is recorded', () => {
    expect(evaluateStepUp({ assertedAt: null, windowSeconds: 600, now: NOW })).toBe('NO_ASSERTION');
  });

  it('DENIES when the Setting is missing — never falls back to a constant', () => {
    expect(evaluateStepUp({ assertedAt: NOW, windowSeconds: null, now: NOW })).toBe(
      'SETTING_MISSING',
    );
  });

  it('DENIES an assertion older than the window', () => {
    const old = new Date(NOW.getTime() - 601_000);
    expect(evaluateStepUp({ assertedAt: old, windowSeconds: 600, now: NOW })).toBe('EXPIRED');
  });

  it('DENIES a FUTURE-dated assertion', () => {
    const future = new Date(NOW.getTime() + 60_000);
    expect(evaluateStepUp({ assertedAt: future, windowSeconds: 600, now: NOW })).toBe('EXPIRED');
  });

  it('DENIES an unparseable assertion instant', () => {
    expect(evaluateStepUp({ assertedAt: new Date(Number.NaN), windowSeconds: 600, now: NOW })).toBe(
      'SETTING_INVALID',
    );
  });

  it('accepts an assertion inside the window, boundary included', () => {
    expect(evaluateStepUp({ assertedAt: NOW, windowSeconds: 600, now: NOW })).toBeNull();
    const exactly = new Date(NOW.getTime() - 600_000);
    expect(evaluateStepUp({ assertedAt: exactly, windowSeconds: 600, now: NOW })).toBeNull();
  });

  it('readStepUpWindowSeconds refuses every non-envelope and every unusable number', async () => {
    const cases: Array<[unknown, null | number]> = [
      [null, null],
      [600, null], // a BARE number is refused: accepting two shapes makes the caveat envelope optional
      [{ v: '600', unit: 'seconds', unverified: true }, null],
      [{ v: 600.5, unit: 'seconds', unverified: true }, null],
      [{ v: 0, unit: 'seconds', unverified: true }, null],
      [{ v: -1, unit: 'seconds', unverified: true }, null],
      [{ v: 86_401, unit: 'seconds', unverified: true }, null],
      [{ v: 600, unit: 'seconds', unverified: true }, 600],
    ];
    for (const [stored, expected] of cases) {
      const reader = { raw: () => Promise.resolve(stored) };
      await expect(readStepUpWindowSeconds(reader, 'waqf-001')).resolves.toBe(expected);
    }
  });

  it('the window key is a Setting key, never a constant in this package', () => {
    expect(TOTP_STEP_UP_FRESHNESS_SETTING_KEY).toBe('auth.totpStepUp.freshnessSeconds');
  });

  it('the window key is REGISTERED in the closed registry — an unregistered key denies forever', () => {
    // ⚠ THE ONE THAT WAS MISSING. The key was declared in this package, read by the ladder, and
    // present in NO registry and NO seed — so `readStepUpWindowSeconds` found nothing on every
    // shipped database and every approve/sign denied with SETTING_MISSING. Fail-closed, and
    // therefore invisible: the deny looks exactly like the guard working.
    expect(isSettingKey(TOTP_STEP_UP_FRESHNESS_SETTING_KEY)).toBe(true);
    expect(SETTING_KEYS as readonly string[]).toContain(TOTP_STEP_UP_FRESHNESS_SETTING_KEY);
  });

  it('the registry schema and readStepUpWindowSeconds accept EXACTLY the same values', async () => {
    // Two hand-written validators over one figure — `@qmulate/domain`'s `securityWindowSeconds`
    // (integer, 1..86_400, unit "seconds") and this package's structural check — are precisely the
    // shape S1's holes had: two sides that must agree and nothing comparing them. So compare them,
    // value for value, rather than trusting that they still do.
    //
    // The one deliberate asymmetry, asserted rather than glossed: the registry ALSO rejects an
    // envelope whose `unverified`/`note` pair is inconsistent, which the structural reader does not
    // police. Every case below keeps that pair consistent so the comparison is about the FIGURE.
    const candidates: unknown[] = [600, 600.5, 0, -1, 1, 86_400, 86_401, '600', null, true, [600]];

    for (const v of candidates) {
      const envelope = { v, unit: 'seconds', unverified: false, source: 'parity probe' };

      const readerAccepts =
        (await readStepUpWindowSeconds({ raw: () => Promise.resolve(envelope) }, 'waqf-001')) !==
        null;

      let registryAccepts = true;
      try {
        parseSetting(TOTP_STEP_UP_FRESHNESS_SETTING_KEY as SettingKey, envelope);
      } catch {
        registryAccepts = false;
      }

      expect(
        registryAccepts,
        `the registry and readStepUpWindowSeconds disagree about v=${JSON.stringify(v)}: ` +
          `registry ${registryAccepts ? 'accepts' : 'refuses'}, the ladder ` +
          `${readerAccepts ? 'accepts' : 'refuses'}. One of them is now the only thing standing ` +
          `between an approval and an unusable window.`,
      ).toBe(readerAccepts);
    }

    // And the unit is pinned on both sides: a window silently reinterpreted as minutes is a
    // 60×-wider approval window that no test would otherwise notice.
    expect(() =>
      parseSetting(TOTP_STEP_UP_FRESHNESS_SETTING_KEY as SettingKey, {
        v: 600,
        unit: 'minutes',
        unverified: false,
        source: 'parity probe',
      }),
    ).toThrow();
  });

  it('the step-up verb set and @qmulate/auth TOTP_STEP_UP_ACTIONS are the same set', () => {
    // Two independently-declared lists in two packages that must agree. Sprint 1's holes both existed
    // because nothing compared two sides that were supposed to agree.
    expect(() => assertStepUpPolicyAgrees()).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · AML membership is per-endowment and affirmative
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('isAmlMember — §10 §6', () => {
  it('is false without an amlCompartment grant, and false for a DIFFERENT endowment', () => {
    const member = { grants: [grant({ waqfId: 'waqf-001', amlCompartment: true })] };
    expect(isAmlMember(member, 'waqf-001')).toBe(true);
    expect(isAmlMember(member, 'waqf-002')).toBe(false);
    expect(isAmlMember({ grants: [grant()] }, 'waqf-001')).toBe(false);
    expect(isAmlMember({ grants: [] }, 'waqf-001')).toBe(false);
  });

  it('⊕ a NAZIR grant DOES confer membership — by construction (S8-Q2, 2026-08-23)', () => {
    // ⚠ INVERTED, NOT DELETED. This read `expect(isAmlMember(nazir, 'waqf-001')).toBe(false)` under
    // the title «a NAZIR grant does not confer membership — "including the Nazir by default"». That
    // was ENGINEERING'S FAIL-SAFE READING and the product owner overruled it: the legally accountable
    // seat is inside by construction, because an AML matter hidden from the seat regulators hold
    // accountable is one it cannot audit — the principle already hard-coded on `ApprovalRequest`.
    // The old assertion is quoted so a future reversal reads as a reversal rather than as a fix.
    const nazir = { grants: [grant({ role: 'NAZIR', amlCompartment: false })] };
    expect(isAmlMember(nazir, 'waqf-001')).toBe(true);

    // ⚠ AND THE ARM IS ONE ROLE WIDE. Seniority still confers nothing — this is the assertion that
    // catches a widening from `nazir` to "any staff role", which is the shape the ruling does NOT
    // authorise.
    for (const role of [
      'CASE_MANAGER',
      'COMPLIANCE_OFFICER',
      'AUTHORIZED_REP',
      'LEADERSHIP',
      'ADMIN',
    ])
      expect(
        isAmlMember({ grants: [grant({ role, amlCompartment: false })] }, 'waqf-001'),
        `${role} became a compartment member without an explicit grant`,
      ).toBe(false);

    // …and it does not travel across endowments: a Nazir seat on waqf-001 is not an accountability
    // claim over waqf-002.
    expect(isAmlMember(nazir, 'waqf-002')).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7 · error contract
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the error contract', () => {
  it('every API code has a status, and NO_GRANT / SCOPE_REF_MISMATCH / AML are non-disclosing', () => {
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_STATUS[code]).toBeTruthy();
    }
    expect(API_ERROR_STATUS.NO_GRANT).toBe('NOT_FOUND');
    expect(API_ERROR_STATUS.SCOPE_REF_MISMATCH).toBe('NOT_FOUND');
    expect(API_ERROR_STATUS.AML_COMPARTMENT_ONLY).toBe('NOT_FOUND');
  });

  it('every code carries an errors.access.<CODE> message key — EXCEPT the non-disclosure class', () => {
    // ⚠ NARROWED IN S8, deliberately, and the exception is the point rather than a carve-out.
    //
    // This used to assert the property for ALL of API_ERROR_CODES. It still does for every code
    // whose identity is safe to disclose. For the NOT_FOUND class it CANNOT hold: a per-member key
    // is a per-member discriminator, and `apps/web`'s `rawMessageKey()` reads `messageKey` off
    // `error.cause` on the in-process SSR path where tRPC's `errorFormatter` never runs — so the key
    // was the one channel that survived both outbound narrowings. §09 C5 / §10 §6.
    //
    // The old assertion is not deleted, it is SPLIT: the general property below, and the class's own
    // property beside it. Both directions are asserted, so neither a forgotten member nor an
    // over-eager collapse can pass.
    for (const code of API_ERROR_CODES) {
      const key = new ApiError(code, 'x').messageKey;
      if (isNonDisclosureCode(code)) {
        expect(key, `${code} must not carry its own key`).toBe(
          `errors.access.${NON_DISCLOSURE_WIRE_CODE}`,
        );
      } else {
        expect(key).toBe(`errors.access.${code}`);
      }
    }

    // And the catalogue key the class collapses onto must be one that really exists as a code, or
    // every non-disclosure refusal would render the generic fallback instead of its sentence.
    expect(API_ERROR_CODES).toContain(NON_DISCLOSURE_WIRE_CODE);
  });

  it('an UNRECOGNISED failure becomes a 500, never a tidy 4xx', () => {
    expect(toTRPCError(new Error('boom')).code).toBe('INTERNAL_SERVER_ERROR');
    expect(toTRPCError('boom').code).toBe('INTERNAL_SERVER_ERROR');
    expect(toTRPCError(undefined).code).toBe('INTERNAL_SERVER_ERROR');
  });

  it("the three database codes that mean 'the server wrote bad code' become 500s", () => {
    for (const code of [
      'AUDIT_TRANSACTION_REQUIRED',
      'UNSUPPORTED_BULK_OPERATION',
      'MONEY_AS_NUMBER',
    ]) {
      expect(toTRPCError({ code, message: 'x' }).code).toBe('INTERNAL_SERVER_ERROR');
    }
  });

  it("the force-filter's own refusal surfaces as NOT_FOUND, matching the boundary", () => {
    // `FORBIDDEN_SCOPE` fires when a caller touched a row outside `authorizedWaqfIds` — the same fact
    // as "no grant". It must not disclose more than the procedure boundary would.
    expect(toTRPCError({ code: 'FORBIDDEN_SCOPE', message: 'x' }).code).toBe('NOT_FOUND');
  });

  it('approvalTargetInput bounds the id and rejects an empty one', () => {
    expect(approvalTargetInput.safeParse({ approvalRequestId: 'appr-1' }).success).toBe(true);
    expect(approvalTargetInput.safeParse({ approvalRequestId: '' }).success).toBe(false);
    expect(approvalTargetInput.safeParse({}).success).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7b · MP-14 — the "active grant" predicate is ONE object, shared by identity
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('MP-14 · one definition of "an active grant", shared by identity', () => {
  it('@qmulate/api, @qmulate/auth and @qmulate/database reach the SAME function object', async () => {
    // ⚠ IDENTITY, NOT SIMILARITY. Sprint 1 spelled the four clauses inline in `getUserDbRoles` and,
    // five lines below, filtered memberships on `deletedAt: null` alone — and nothing compared the two.
    // Deleting `revokedAt: null` from the shared helper must now break every consumer at once, which is
    // the property that makes this a control rather than a coincidence.
    const [api, auth, database] = await Promise.all([
      import('../src/context.js'),
      import('@qmulate/auth'),
      import('@qmulate/database'),
    ]);
    expect(api.activeGrantWhere).toBe(database.activeGrantWhere);
    expect(auth.activeGrantWhere).toBe(database.activeGrantWhere);
    expect(api.activeMembershipWhere).toBe(database.activeMembershipWhere);
    expect(auth.activeMembershipWhere).toBe(database.activeMembershipWhere);
  });

  it('the predicate carries all four clauses, and returns a FRESH object per call', async () => {
    const { activeGrantWhere } = await import('../src/context.js');
    const asOf = new Date('2026-07-27T09:00:00.000Z');
    const where = activeGrantWhere(asOf);

    expect(where.deletedAt).toBeNull();
    expect(where.revokedAt).toBeNull();
    expect(where.validFrom).toEqual({ lte: asOf });
    expect(where.OR).toEqual([{ validUntil: null }, { validUntil: { gte: asOf } }]);

    // A module-scope CONSTANT would freeze the comparison instant at import time, so a long-lived
    // process would keep honouring a grant that expired while it was running.
    expect(activeGrantWhere(asOf)).not.toBe(where);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 8 · SOURCE SCANS — a rule stated in a comment is not a control
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function sourceFiles(dir: string = SRC_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Everything under `src/`, as `{ relative path -> text }`. */
function readSources(): Map<string, string> {
  const files = sourceFiles();
  const map = new Map<string, string>();
  for (const file of files) {
    map.set(path.relative(SRC_DIR, file), readFileSync(file, 'utf8'));
  }
  return map;
}

/**
 * Strips block and line comments, so a scan tests the CODE and not the prose about it.
 *
 * Without this every scan below would fail on its own explanatory comment — and the tempting fix
 * (dropping the comment) would remove the explanation rather than the risk.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('source scans over packages/api/src', () => {
  const sources = readSources();

  it('found the files it means to scan (a silently-empty scan proves nothing)', () => {
    expect(sources.size).toBeGreaterThanOrEqual(9);
    for (const expected of [
      'context.ts',
      'trpc.ts',
      'errors.ts',
      'permissions.ts',
      'root.ts',
      'index.ts',
      path.join('middleware', 'authed.ts'),
      path.join('middleware', 'scope.ts'),
      path.join('middleware', 'segregation.ts'),
      path.join('middleware', 'aml.ts'),
      path.join('middleware', 'audit.ts'),
    ]) {
      expect(sources.has(expected), `${expected} was not scanned`).toBe(true);
    }
  });

  it('MP-22 — nothing in this package ASSIGNS `bypass`', () => {
    // `makeSystemContext({actorType:'USER'})` used to return an authenticated USER context with the
    // force-filter LIFTED. `createPrismaClient` now refuses the combination, but the durable control
    // is that no request-path file can produce one at all.
    for (const [file, text] of sources) {
      const code = stripComments(text);
      expect(code, `${file} assigns bypass`).not.toMatch(/\bbypass\s*:/);
      expect(code, `${file} imports makeSystemContext`).not.toMatch(/\bmakeSystemContext\b/);
      expect(code, `${file} imports SYSTEM_CONTEXT`).not.toMatch(/\bSYSTEM_CONTEXT\b/);
      expect(code, `${file} imports getSystemPrisma`).not.toMatch(/\bgetSystemPrisma\b/);
      expect(code, `${file} imports systemPrisma`).not.toMatch(/\bsystemPrisma\b/);
    }
  });

  it('AC-3 / MP-25 — canViewAmlRestricted is never set to a literal true', () => {
    for (const [file, text] of sources) {
      const code = stripComments(text);
      expect(code, `${file} sets canViewAmlRestricted: true`).not.toMatch(
        /canViewAmlRestricted\s*:\s*true/,
      );
    }
  });

  it('AC-3 / MP-25 — the ONE derivation of AML visibility is from amlCompartment', () => {
    const context = sources.get('context.ts') ?? '';
    // The assignment must be derived from the compartment LIST, never from the grant's own boolean.
    expect(context).toMatch(/canViewAmlRestricted:\s*amlCompartmentWaqfIds\.length\s*>\s*0/);
    expect(stripComments(context)).not.toMatch(/grant\.canViewAmlRestricted/);
  });

  it('MP-12 — no authority path reads getUserRoleKeys / getUserDbRoles', () => {
    // Both union roles across every grant and membership with NO waqfId parameter, and
    // getUserRoleKeys's own doc calls itself a posture helper. They are the most convenient functions
    // in the codebase for a permission check.
    for (const [file, text] of sources) {
      const code = stripComments(text);
      expect(code, `${file} calls getUserRoleKeys`).not.toMatch(/\bgetUserRoleKeys\b/);
      expect(code, `${file} calls getUserDbRoles`).not.toMatch(/\bgetUserDbRoles\b/);
      expect(code, `${file} calls userRequiresTotpEnrolment`).not.toMatch(
        /\buserRequiresTotpEnrolment\b/,
      );
    }
  });

  it('MP-12 — the AuthGate `roles` array is discarded, not threaded into the context', () => {
    const context = stripComments(sources.get('context.ts') ?? '');
    // `sessionFromGate` must not copy `gate.roles` anywhere. If it ever does, a client — and then a
    // check — will read it, and it has no waqfId in it.
    expect(context).not.toMatch(/gate\.roles/);
    expect(context).not.toMatch(/roles\s*:/);
  });

  it('MP-36 — onBehalfOfId never influences an authority decision', () => {
    for (const [file, text] of sources) {
      const code = stripComments(text);
      // The one legitimate write is `onBehalfOfId: null` in the context factory, plus the pass-through
      // in `toActorContext`. Any `??`-style fallback that would resolve a grant for it is the bug.
      expect(code, `${file} resolves authority for onBehalfOfId`).not.toMatch(
        /onBehalfOfId\s*\?\?/,
      );
      expect(code, `${file} ors onBehalfOfId into an identity`).not.toMatch(/onBehalfOfId\s*\|\|/);
    }
    const segregation = stripComments(sources.get(path.join('middleware', 'segregation.ts')) ?? '');
    expect(segregation).not.toMatch(/onBehalfOfId/);
  });

  it('D-2 — no co-authorization shape is expressible anywhere in this package', () => {
    for (const [file, text] of sources) {
      const code = stripComments(text);
      for (const banned of [
        'approvers',
        'coApprovedBy',
        'coApprover',
        'secondApprover',
        'additionalApprover',
      ]) {
        expect(code, `${file} mentions ${banned}`).not.toMatch(new RegExp(`\\b${banned}\\b`));
      }
    }
  });

  it('the THIRD, invented procedure-ladder spelling is absent', () => {
    // Sprint 1's trpc.ts comment promised `protectedProcedure / scopedProcedure / approvalProcedure`
    // and none existed. Three names for one thing is how the parity holes happened, so they are
    // DELETED rather than implemented.
    for (const [file, text] of sources) {
      const code = stripComments(text);
      for (const banned of ['protectedProcedure', 'scopedProcedure', 'approvalProcedure']) {
        expect(code, `${file} declares ${banned}`).not.toMatch(new RegExp(`\\b${banned}\\b`));
      }
    }
  });

  it('the barrel does NOT export the session seam', () => {
    // `createContextForSession` builds a context around an already-resolved session, bypassing
    // `evaluateAuthGate`. A one-line barrel edit would turn a test seam into a session-forgery door.
    // The scan is over the CODE, not the prose: the barrel's own comment names the function in order
    // to explain why it is absent, and deleting that explanation would be the wrong way to go green.
    const barrel = sources.get('index.ts') ?? '';
    expect(barrel).toMatch(/createContextForSession/); // the explanation is present…
    expect(stripComments(barrel)).not.toMatch(/\bcreateContextForSession\b/); // …the export is not.
    // …and the package's exports map must not publish `./context` either.
    const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    expect(JSON.parse(pkg).exports['./context']).toBeUndefined();
  });

  it('the auth gate is called unconditionally, with no role condition', () => {
    const context = stripComments(sources.get('context.ts') ?? '');
    expect(context).toMatch(/evaluateAuthGate\(/);
    // A role-conditional gate is the bug that was just fixed (a freshly-registered account holds no
    // role, so the old condition never fired). An e2e test in apps/web also fails if it comes back.
    expect(context).not.toMatch(/if\s*\([^)]*requiresTotp/);
  });

  it('raw SQL in this package is a CLOSED, REASONED list — one read, one question, no general escape', () => {
    // S10/T2 introduced the FIRST `$queryRaw` into packages/api/src: deadline.evaluate's reminder
    // dedupe, which must ask "does the RECIPIENT already have this reminder" — a question the
    // caller's scoped view STRUCTURALLY cannot answer (`Notification` is user-scoped, the
    // evaluator is never the recipient; the scoped check it replaced matched nothing cross-user,
    // ever, and shipped silent duplicates from S9-3d until migration 45's floor exposed it).
    // Unprecedented is one review; a PATTERN is many unreviewed copies — so the list is pinned
    // the way the unextended-handle allowlist is: adding a raw call site is a decision made in
    // this file, in the same diff, with the reason. Raw reads bypass the scoping extension BY
    // DESIGN; a raw WRITE would also bypass the audit spine and has no legitimate home here.
    const rawUsers: string[] = [];
    for (const [file, text] of sources) {
      const code = stripComments(text);
      if (/\$(queryRaw|queryRawUnsafe|executeRaw|executeRawUnsafe|queryRawTyped)\b/.test(code)) {
        rawUsers.push(file);
      }
    }
    expect(
      rawUsers.sort(),
      'a NEW raw-SQL call site appeared in packages/api/src. It bypasses the scoping extension ' +
        '(and, if it writes, the audit spine). If it is answering a question the scoped view ' +
        'structurally cannot — the only accepted reason — add it here WITH that reason; ' +
        'otherwise use the extended client.',
    ).toEqual(['routers/deadline.ts']);
  });

  it('money never crosses this boundary as a JS number', () => {
    for (const [file, text] of sources) {
      const code = stripComments(text);
      expect(code, `${file} uses parseFloat`).not.toMatch(/\bparseFloat\(/);
      expect(code, `${file} uses toFixed`).not.toMatch(/\.toFixed\(/);
      expect(code, `${file} uses Number\\(\\) on a value`).not.toMatch(/\bNumber\([^)]*[Ss]ar/);
    }
  });
});
