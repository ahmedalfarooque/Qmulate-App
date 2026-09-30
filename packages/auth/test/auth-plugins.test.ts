/**
 * MP-33 — THE better-auth PLUGIN SET IS EXACTLY `{ twoFactor }`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A SECOND APPROVAL AUTHORITY CREATED BY A ONE-LINE EDIT TO AN ARRAY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `buildAuth()` configures `plugins: [twoFactor({ issuer: 'Cumulate App', totpOptions: … })]` and nothing
 * pinned that array. better-auth's `admin` plugin ships USER IMPERSONATION: adding it would let a
 * `SYSTEM_ADMIN` mint a session as the Nazir and approve as them — and every downstream control
 * would agree that the Nazir did it. The tRPC context would resolve the Nazir's grants, the
 * `approval_request_authority` trigger would find a genuine ACTIVE `NAZIR` grant, the audit event
 * would name the Nazir, and the hash chain would cryptographically SEAL the lie. Nothing in the
 * three enforcement layers this sprint built can detect it, because at every layer it is
 * indistinguishable from the Nazir acting.
 *
 * That is the whole argument for pinning a plugin array in a test: the blast radius is total and the
 * change is one line, so the cost of noticing has to be zero.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A SOURCE SCAN AND NOT AN INSTANCE INSPECTION
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Calling `getAuth()` constructs the better-auth instance, which reads `BETTER_AUTH_URL` /
 * `BETTER_AUTH_SECRET` through the fail-fast env schema and builds a Prisma client — `src/server.ts`
 * even does `getBasePrismaClient()` at module scope. The auth vitest config says so explicitly:
 * server.ts "cannot be unit-tested in isolation". So the pin is over the SOURCE, which has one real
 * advantage over inspecting a constructed instance: it catches an IMPORT of an impersonation-capable
 * plugin even before it is added to the array, and it cannot be satisfied by a plugin that hides its
 * own name at runtime.
 *
 * The complementary behavioural proof (register → enrol TOTP → sign in) is the e2e job's, per the
 * E0 exit criterion.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SERVER_SOURCE = readFileSync(
  fileURLToPath(new URL('../src/server.ts', import.meta.url)),
  'utf8',
);

/** Comments discuss plugins by name; only CODE counts. */
const CODE = SERVER_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * better-auth plugins that can act as another user, or that widen the auth surface in a way that
 * touches authority. Each is named with the reason, so removing one from this list is a decision.
 */
const FORBIDDEN_PLUGINS: readonly { readonly name: string; readonly why: string }[] = [
  { name: 'admin', why: 'ships user impersonation — a SYSTEM_ADMIN could approve AS the Nazir' },
  {
    name: 'organization',
    why: 'introduces a second membership/permission model alongside WaqfAccessGrant (§10 principle 2: scope is the endowment, never the organisation)',
  },
  {
    name: 'apiKey',
    why: 'a long-lived non-human credential with no per-endowment grant behind it',
  },
  { name: 'bearer', why: 'same: a token-shaped identity outside the access matrix' },
  { name: 'jwt', why: 'moves authorization claims into a self-asserted token' },
  { name: 'oidcProvider', why: 'turns QMULATE into an identity provider for third parties' },
  {
    name: 'genericOAuth',
    why: 'NFR-06 requires SELF-HOSTED auth with no third-party identity provider',
  },
  { name: 'anonymous', why: 'an unattributable actor cannot appear in a 10-year audit trail' },
  { name: 'username', why: 'a second login identifier; email is the one identity key' },
];

describe('MP-33 · the configured plugin set', () => {
  it('finds the plugins array at all', () => {
    // A scan that silently found nothing would pass forever. This is the guard against that.
    expect(
      CODE,
      'no `plugins:` array in src/server.ts — the scan is broken, not the config',
    ).toMatch(/plugins:\s*\[/);
  });

  it('contains EXACTLY one plugin, and it is twoFactor', () => {
    const match = /plugins:\s*\[([\s\S]*?)\]\s*,/.exec(CODE);
    expect(match, 'could not read the plugins array').not.toBeNull();
    const body = match?.[1] ?? '';

    // Every top-level call in the array. `twoFactor({ … })` -> `twoFactor`.
    const invoked = [...body.matchAll(/(^|[\s,])([A-Za-z_$][\w$]*)\s*\(/g)].map(
      (entry) => entry[2] ?? '',
    );
    expect(
      invoked,
      `the plugin array must be exactly [twoFactor]; found [${invoked.join(', ')}]. Any additional ` +
        `plugin is a change to who can act as whom, and belongs in a reviewed decision rather than a ` +
        `one-line edit.`,
    ).toEqual(['twoFactor']);
  });

  it.each(FORBIDDEN_PLUGINS)('does not import or configure `$name` — $why', ({ name }) => {
    // Checked against the IMPORT as well as the call: an unused import is a one-character edit away
    // from being a used one, and it is the review signal that arrives earliest.
    expect(CODE, `\`${name}\` is imported from better-auth/plugins`).not.toMatch(
      new RegExp(`import[^;]*\\b${name}\\b[^;]*from\\s*'better-auth`),
    );
    expect(CODE, `\`${name}()\` appears in src/server.ts`).not.toMatch(
      new RegExp(`\\b${name}\\s*\\(`),
    );
  });

  it('imports NOTHING from better-auth/plugins except twoFactor', () => {
    // The whole-import direction, so a plugin nobody thought to list above is caught too.
    const imports = [...CODE.matchAll(/import\s*\{([^}]*)\}\s*from\s*'better-auth\/plugins'/g)]
      .flatMap((entry) => (entry[1] ?? '').split(','))
      .map((specifier) => specifier.trim())
      .filter((specifier) => specifier.length > 0);
    expect(imports).toEqual(['twoFactor']);
    // …and no namespace/star import that would smuggle the rest in.
    expect(CODE).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s*'better-auth\/plugins'/);
  });

  it('never enables impersonation by any spelling', () => {
    expect(CODE).not.toMatch(/impersonat/i);
    expect(CODE).not.toMatch(/\bactAs\b|\bsudo\b|\bsu\(/i);
  });

  it('keeps TOTP configured the way NFR-06 needs it', () => {
    // The plugin that IS present has to be doing its job: a 6-digit, 30-second TOTP with the Cumulate App
    // issuer. `freshAge` is what a step-up assertion is measured against.
    expect(CODE).toMatch(/twoFactor\(\s*\{[^}]*issuer:\s*'Cumulate App'/);
    expect(CODE).toMatch(/digits:\s*6/);
    expect(CODE).toMatch(/period:\s*30/);
    expect(CODE).toMatch(/freshAge:\s*STEP_UP_FRESH_AGE_SECONDS/);
  });

  it('keeps authorization OFF the User row', () => {
    // §10 principle 2: authorization is per endowment. A `user.role` column, or a better-auth
    // `roles`/`permissions` option, would create a second authority source that no per-waqf check
    // consults.
    expect(CODE).not.toMatch(/\buser\.role\b/);
    expect(CODE).not.toMatch(/defaultRole|adminRoles|roles:\s*\[/);
  });

  it('is still self-hosted email + password (NFR-06)', () => {
    expect(CODE).toMatch(/emailAndPassword:\s*\{[\s\S]{0,200}enabled:\s*true/);
    expect(CODE).not.toMatch(/socialProviders/);
  });
});
