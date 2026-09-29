// QMULATE — the seed's credential constants.  (S10 repo-maintenance stage, 2026-08-31)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠ YES, THIS FILE PINS A PASSWORD HASH IN SOURCE — ON PURPOSE. READ THIS BEFORE "FIXING" IT.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// `SEED_PASSWORD` is a PUBLISHED fixture constant, not a secret and not treated as one: its only
// job is to make E0's exit criterion — "a seeded admin can register, enrol TOTP and log in" —
// actually reachable on a development database. The seed that applies it refuses to run unless
// `DATA_CLASSIFICATION=fixture-only` (`../guardrail.ts`, NFR-03), so the only databases that ever
// hold this credential are fixture-only ones, and the hash of a public value is itself public.
// A KSA-resident production database is provisioned through the onboarding flow (E11), never by
// this seed.
//
// WHY A PRECOMPUTED CONSTANT AND NOT A RUNTIME `hashPassword()` CALL — the S10 lockfile blocker
// (`docs/product/prd/S10-lockfile-blocker.md`). The one dynamic `better-auth/crypto` import this
// constant replaced (seed.ts §2b) was the ONLY reason `better-auth`
// sat in this package's manifest — and that manifest entry made `packages/database` the single
// workspace importer holding BOTH `zod@^3` and `better-auth`, which mis-routed
// `better-call@1.3.7`'s `zod` peer on every fresh resolve: any `pnpm add`, anywhere in the repo,
// flipped `better-call@1.3.7(zod@4.4.3)` → `(zod@3.25.76)` and broke `@qmulate/auth`'s typecheck.
// Moving the call into `@qmulate/auth` (which owns better-auth legitimately) is impossible
// without a workspace cycle — auth already depends on this package. So the one runtime need — a
// better-auth-format hash of a public constant — became a constant, and `better-auth` left this
// package entirely.
//
// PROVENANCE AND REGENERATION. Generated 2026-08-31 by better-auth's OWN hasher (scrypt; the
// `salt:hash` hex format embeds what verification needs, so `verifyPassword` is self-contained),
// at the workspace's installed better-auth@1.6.25. To regenerate — from `packages/auth`, the
// package that owns better-auth; this package deliberately cannot resolve it any more:
//
//   cd packages/auth && node -e \
//     "import('better-auth/crypto').then(async (m) => console.log(await m.hashPassword('fixture-only-not-a-secret-9271')))"
//
// (The salt is random per generation, so a regenerated value differs from this one and is equally
// valid — pin whichever you generate, and the parity test below re-proves it.)
//
// CONTROLS — this constant cannot rot silently:
//   • `packages/auth/test/seed-credential-parity.test.ts` re-verifies it against
//     `better-auth/crypto`'s `verifyPassword` on every unit run — it dies on a corrupted
//     constant AND on a future better-auth upgrade that drops compatibility with this format;
//   • `packages/database/test/seed-credentials.test.ts` refuses `better-auth` BY NAME back into
//     this package's manifest or source — the reintroduction is the one route back to the hazard;
//   • the E2E suite signs in with `SEED_PASSWORD` through the real better-auth verify path.
//
// A DELIBERATE side effect, in the right direction: a runtime hash was salted per run, making the
// credential `account` row the seed's ONE nondeterministic field — against guarantee 2's own
// wording in `../seed.ts`. A pinned constant makes the credential rows deterministic like every
// other seeded row.

/**
 * The fixture-only sign-in password for every seeded operator.
 *
 * NOT a secret — see the header. Printed by the seed's closing summary so a developer can sign
 * in as `admin@example.test`.
 */
export const SEED_PASSWORD = 'fixture-only-not-a-secret-9271';

/**
 * `SEED_PASSWORD`, hashed by better-auth's own `hashPassword` (better-auth@1.6.25, 2026-08-31).
 * Format: `salt:hash`, hex, scrypt — exactly what better-auth's credential sign-in path
 * verifies. Provenance, regeneration command and the controls that keep this honest are in the
 * header comment above.
 */
export const SEED_PASSWORD_HASH =
  'dd6787dde5110f457911b82a08b66eeb:48806d8d429477fda69f47528102e481b433df2ba84bc05fb6202fef7ce2464d3308f966f15a797ebfd5ed30a1cfb2896650c826a9a6ce609e9e5d87db21eda0';
