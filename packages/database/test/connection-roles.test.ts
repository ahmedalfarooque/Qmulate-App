/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE PRIVILEGE-SEPARATION CREDENTIALS FAIL **CLOSED**  (ADR-0008 round 6)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * `src/client.ts` and `src/access-matrix.ts` both state, in comments, that a missing privileged
 * credential **throws, naming the variable, and never falls back to `DATABASE_URL`**. That is a
 * security claim, and this repository's rule is that a comment asserting a property the code lacks is
 * a defect — five of them shipped in this sprint and each was believed by the next reader. So the
 * claim is tested here rather than asserted there.
 *
 * ── WHY THE FALLBACK WOULD BE WORSE THAN THE MISSING VARIABLE ────────────────────────────────────
 * If `provisionAccessGrant()` silently used the app connection when `ACCESS_MATRIX_DATABASE_URL` was
 * absent, one of two things would happen. Either the write fails with a bare
 * `42501 permission denied for table waqf_access_grant`, which reads like a database
 * misconfiguration and sends the reader looking in the wrong place; or — if a later migration ever
 * loosens one GRANT — it SUCCEEDS on the unprivileged connection, and the entire separation is
 * defeated with every test still green. A privilege split that falls back is worse than none, because
 * it looks done.
 *
 * ── NO DATABASE REQUIRED ────────────────────────────────────────────────────────────────────────
 * These are unit tests. Nothing here opens a connection: the credential check happens BEFORE any
 * client is constructed, which is itself part of the contract — a runtime that was never given the
 * credential must fail on the way in, not half-way through an audited transaction.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CONNECTION_ROLE_ENV, MissingConnectionCredentialError } from '../src/client.js';
import { PROVISIONING_ROLE, OWNER_ROLE, RUNTIME_ROLE } from '../src/provision-roles.js';

describe('ADR-0008 round 6 · the connection-role registry', () => {
  it('maps each role to the documented environment variable, and nothing else', () => {
    // Pinned because three other files (the `.env.example` block, `scripts/dev-postgres.ts`'s
    // `childEnvironment()`, and every CI job that stands up Postgres) hard-code these names. A rename
    // here without those is a runtime that silently cannot find its privileged credential.
    expect(CONNECTION_ROLE_ENV).toEqual({
      app: 'DATABASE_URL',
      provisioner: 'ACCESS_MATRIX_DATABASE_URL',
      owner: 'MIGRATOR_DATABASE_URL',
    });
  });

  it('names the right variable in the refusal, for each privileged role', () => {
    for (const role of ['provisioner', 'owner'] as const) {
      const error = new MissingConnectionCredentialError(role);
      expect(error.code).toBe('MISSING_CONNECTION_CREDENTIAL');
      expect(error.role).toBe(role);
      // The MESSAGE has to carry the variable name: a reader who hits this has no other clue.
      expect(error.message).toContain(CONNECTION_ROLE_ENV[role]);
      // …and it must say WHY there is no fallback, or the next reader adds one.
      expect(error.message).toMatch(/cannot fall back|CANNOT fall back/i);
    }
  });

  it('keeps the three role names in step between TypeScript and SQL', () => {
    // `provision-roles.ts` creates them; migration 10 §1 reads them through
    // `qmulate_runtime_role()` / `qmulate_provisioning_role()` / `qmulate_owner_role()`, and the RLS
    // policies in migration 11 compare `current_user` against those. A drift means roles that exist
    // and hold no privileges — provisioned, green, unenforced.
    expect([RUNTIME_ROLE, PROVISIONING_ROLE, OWNER_ROLE]).toEqual([
      'qmulate_app',
      'qmulate_provisioner',
      'qmulate_owner',
    ]);
  });
});

describe('ADR-0008 round 6 · the access-matrix path fails closed', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.ACCESS_MATRIX_DATABASE_URL;
    delete process.env.ACCESS_MATRIX_DATABASE_URL;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.ACCESS_MATRIX_DATABASE_URL;
    else process.env.ACCESS_MATRIX_DATABASE_URL = saved;
  });

  it('provisionAccessGrant() REFUSES without the credential, naming it — it does not use DATABASE_URL', async () => {
    const { provisionAccessGrant } = await import('../src/access-matrix.js');

    await expect(
      provisionAccessGrant(
        {
          actorId: 'user-admin-001',
          actorType: 'USER',
          authorizedWaqfIds: ['waqf-001'],
          permissions: ['admin:access_matrix:write'],
          requestId: 'fail-closed-probe',
        } as never,
        {
          userId: 'user-unscoped',
          waqfId: 'waqf-001',
          role: 'AUDITOR',
          permissions: ['endowment:waqf:read'],
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      ),
      'provisionAccessGrant() ran without ACCESS_MATRIX_DATABASE_URL. It has therefore fallen back to ' +
        'some other connection — which is either a confusing 42501 or, if a GRANT is ever loosened, a ' +
        'privileged write performed on the unprivileged connection with every test still green.',
    ).rejects.toThrow(/ACCESS_MATRIX_DATABASE_URL/);
  });

  it('revokeAccessGrant() refuses the same way', async () => {
    const { revokeAccessGrant } = await import('../src/access-matrix.js');

    await expect(
      revokeAccessGrant(
        {
          actorId: 'user-admin-001',
          actorType: 'USER',
          authorizedWaqfIds: ['waqf-001'],
          permissions: ['admin:access_matrix:write'],
          requestId: 'fail-closed-probe',
        } as never,
        { grantId: 'grant-does-not-matter' },
      ),
    ).rejects.toThrow(/ACCESS_MATRIX_DATABASE_URL/);
  });
});
