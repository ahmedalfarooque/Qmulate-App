// QMULATE — C-08's pure half: which (model, operation, args) triples are refused, and which are not.
//
// The integration suite (`audit-projection.integration.test.ts`) drives the real attack against the
// real extension. This file pins the DECISION TABLE, with no database, so the boundaries of the
// guard are asserted rather than inferred from the two shapes the integration suite happens to use.
//
// The exemption list is the interesting half. A guard that refused everything would be safe and
// useless: it would break `approval.initiate`'s deliberate `create` projection (which keeps a
// beneficiary payload out of a ten-year append-only table) to fix a diff bug a `create` cannot
// produce. So each exemption below is asserted with its reason.

import { describe, expect, it } from 'vitest';

import { UNAUDITED_MODELS } from '@qmulate/database';

import {
  DIFFED_WRITE_OPERATIONS,
  PROJECTION_ARG_KEYS,
  UnauditableProjectionError,
  assertAuditableProjection,
  auditedTx,
  isAuditedModel,
} from '../src/middleware/audit-projection.js';

describe('assertAuditableProjection — what is refused', () => {
  for (const operation of DIFFED_WRITE_OPERATIONS) {
    for (const projection of PROJECTION_ARG_KEYS) {
      it(`refuses ${operation} + ${projection} on an audited model`, () => {
        expect(() =>
          assertAuditableProjection('ApprovalRequest', operation, {
            where: { id: 'a' },
            data: { status: 'APPROVED' },
            [projection]: { id: true },
          }),
        ).toThrow(UnauditableProjectionError);
      });
    }
  }

  it('names every projection present, not just the first', () => {
    let thrown: unknown;
    try {
      assertAuditableProjection('Setting', 'update', {
        where: { id: 'a' },
        select: { id: true },
        include: { waqf: true },
      });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as UnauditableProjectionError).projections).toEqual(['select', 'include']);
  });

  it('the message says WHY and WHAT TO DO — a refusal nobody can act on gets deleted', () => {
    const error = new UnauditableProjectionError('ApprovalRequest', 'update', ['select']);
    expect(error.name).toBe('UnauditableProjectionError');
    expect(error.code).toBe('UNAUDITABLE_PROJECTION');
    expect(error.message).toContain('AUDITED model');
    expect(error.message).toContain('SET TO NULL');
    expect(error.message).toContain('FIX: drop the projection');
    // The three post-image-derived decisions a projection also corrupts are named, so a reader does
    // not "fix" this by concluding the diff is cosmetic.
    expect(error.message).toContain('deriveAction');
  });
});

describe('assertAuditableProjection — what is deliberately ALLOWED', () => {
  it('`create` + `select`: no pre-image ⇒ no diff ⇒ an omitted column is never reported as null', () => {
    expect(() =>
      assertAuditableProjection('ApprovalRequest', 'create', {
        data: { status: 'PENDING' },
        select: { id: true, status: true },
      }),
    ).not.toThrow();
  });

  it('an unprojected update — the whole row comes back and an unchanged column compares equal', () => {
    expect(() =>
      assertAuditableProjection('ApprovalRequest', 'update', {
        where: { id: 'a' },
        data: { status: 'APPROVED' },
      }),
    ).not.toThrow();
  });

  it('a READ with a projection: the extension writes no event for it at all', () => {
    for (const operation of ['findFirst', 'findMany', 'findUnique', 'count', 'aggregate']) {
      expect(() =>
        assertAuditableProjection('Beneficiary', operation, {
          where: { id: 'a' },
          select: { id: true },
        }),
      ).not.toThrow();
    }
  });

  it('an UNAUDITED model: there is no event, so there is no diff to falsify', () => {
    // Derived from `@qmulate/database`'s own exclusion list, never restated — a model that stops
    // being audited must stop being guarded in the same breath, and vice versa.
    const unaudited = Object.keys(UNAUDITED_MODELS);
    expect(unaudited.length).toBeGreaterThanOrEqual(5);
    for (const model of unaudited) {
      expect(
        isAuditedModel(model),
        `${model} is on the exclusion list yet reported as audited`,
      ).toBe(false);
      expect(() =>
        assertAuditableProjection(model, 'update', { where: { id: 'a' }, select: { id: true } }),
      ).not.toThrow();
    }
    // …and the models that matter ARE audited, so the assertion above is not vacuously wide.
    for (const model of ['ApprovalRequest', 'WaqfAccessGrant', 'Setting', 'Waqf', 'Asset']) {
      expect(isAuditedModel(model), `${model} must be audited`).toBe(true);
    }
  });

  it('`select: undefined` is not a projection — an optional spread must not deny', () => {
    expect(() =>
      assertAuditableProjection('Setting', 'update', {
        where: { id: 'a' },
        data: {},
        select: undefined,
      }),
    ).not.toThrow();
  });
});

describe('auditedTx — the Proxy leaves everything else alone', () => {
  it('non-delegate properties and `$`-prefixed members pass straight through', () => {
    const raw = {
      $queryRawUnsafe: () => Promise.resolve([]),
      $transaction: (fn: (tx: unknown) => unknown) => fn('inner'),
      _engine: { update: 'not a function' },
      setting: {
        update: (args: unknown) => Promise.resolve(args),
        findFirst: (args: unknown) => Promise.resolve(args),
      },
    };
    const guarded = auditedTx(raw);

    expect(guarded.$queryRawUnsafe).toBe(raw.$queryRawUnsafe);
    expect(guarded.$transaction((tx) => tx)).toBe('inner');
    // `_engine` has an `update` that is not a function: not a delegate, so untouched by identity.
    expect(guarded._engine).toBe(raw._engine);
  });

  it('a delegate WITHOUT update/upsert is returned by identity, not wrapped', () => {
    const raw = { auditEvent: { findMany: () => Promise.resolve([]) } };
    expect(auditedTx(raw).auditEvent).toBe(raw.auditEvent);
  });

  it('a guarded delegate still forwards an ALLOWED call, arguments intact', async () => {
    const seen: unknown[] = [];
    const raw = {
      setting: {
        update: (args: unknown) => {
          seen.push(args);
          return Promise.resolve('done');
        },
      },
    };
    const args = { where: { id: 'a' }, data: { value: 1 } };
    await expect(auditedTx(raw).setting.update(args)).resolves.toBe('done');
    expect(seen).toEqual([args]);
  });

  it('the delegate name is mapped back to the MODEL name the exclusion list uses', () => {
    // `waqfAccessGrant` (the delegate) must resolve to `WaqfAccessGrant` (the model), or the audited
    // check would consult a key that is in no list and the guard would silently allow everything.
    const raw = { waqfAccessGrant: { update: (_args: unknown) => Promise.resolve(null) } };
    let thrown: unknown;
    try {
      void auditedTx(raw).waqfAccessGrant.update({ where: { id: 'a' }, select: { id: true } });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as UnauditableProjectionError).model).toBe('WaqfAccessGrant');
  });
});
