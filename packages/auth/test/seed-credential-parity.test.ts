// S10 — the cryptographic half of the seed-credential guarantee.
//
// `packages/database` pins a PRECOMPUTED better-auth-format hash of the published fixture
// password (`src/seed/credentials.ts` there; `docs/product/prd/S10-lockfile-blocker.md` for why
// the runtime `hashPassword()` call had to leave that package — its manifest entry mis-routed
// `better-call`'s zod peer and broke THIS package on every fresh `pnpm add`). That constant is
// only honest while better-auth's credential sign-in path still verifies it, and this test is
// where that fact is re-proven on every unit run — in the package that legitimately owns
// better-auth, over the same `verifyPassword` the sign-in path uses.
//
// If a better-auth upgrade ever changes the password format incompatibly, THIS file goes red
// before any developer discovers they cannot sign in to a seeded database. The fix then is to
// regenerate the constant (the command is in credentials.ts's header), not to widen this test.

import { verifyPassword } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';

import { SEED_PASSWORD, SEED_PASSWORD_HASH } from '@qmulate/database/seed/credentials';

describe('the precomputed seed credential verifies under better-auth (S10)', () => {
  it('verifyPassword accepts SEED_PASSWORD against the pinned hash', async () => {
    await expect(
      verifyPassword({ hash: SEED_PASSWORD_HASH, password: SEED_PASSWORD }),
    ).resolves.toBe(true);
  });

  it('negative control: a wrong password is refused against the same hash', async () => {
    // Without this, a verifyPassword that degenerated to `true` for everything would keep the
    // parity test green while proving nothing — the assertion above must be shown able to fail.
    await expect(
      verifyPassword({ hash: SEED_PASSWORD_HASH, password: `${SEED_PASSWORD}-wrong` }),
    ).resolves.toBe(false);
  });
});
