/**
 * packages/auth/src/dev-admin-setup.ts — provision the LOCAL DEVELOPMENT ADMINISTRATOR.
 *
 *   pnpm exec tsx scripts/dev-postgres.ts --run "pnpm db:dev-admin"
 *
 * Reads `DEV_ADMIN_EMAIL` and `DEV_ADMIN_PASSWORD` from the environment (the untracked `.env`),
 * refuses to run outside `DATA_CLASSIFICATION=fixture-only` (the seed's own guardrail), and then:
 *
 *   1. upserts the `user` (email verified, active) and its credential `account` — the password is
 *      hashed by better-auth's OWN `hashPassword`, exactly as the sign-in path verifies it;
 *   2. upserts one `WaqfAccessGrant` per (internal ops role × endowment) — `devAdminGrantPlan` —
 *      through the same audited, owner-connection bootstrap the seed uses for its step 18
 *      (`withAccessMatrixBootstrap`: the admission trigger needs an established issuer, and the
 *      first seat on a database has none; ownership, not a claim, is what suspends it);
 *   3. enrols TOTP through better-auth's own `enableTwoFactor` → `verifyTOTP` path (no parallel
 *      mechanism), and writes the otpauth URI + backup codes to ONE gitignored local file.
 *
 * Idempotent: every write is an upsert keyed on the row's natural key, so a re-run converges the
 * same account rather than duplicating it. Enrolment is skipped when the account is already
 * enrolled unless `--rotate-totp` is passed.
 *
 * Runs ENTIRELY on the owner connection (`MIGRATOR_DATABASE_URL`) for the same reason the seed
 * does — it is a provisioning program, not a request path. Never prints a secret.
 */

import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { hashPassword } from 'better-auth/crypto';

import { assertFixtureOnly } from '@qmulate/database/guardrail';

import { DEV_ADMIN_EMAIL_VARIABLE, devAdminGrantPlan, isDevAdminExempt } from './dev-admin';

/** The gitignored file that receives the enrolment secret. Root of the monorepo. */
const LOCAL_TOTP_FILE = '.dev-admin.local.json';
/** Deterministic id for a freshly created account; an existing user keeps its own id. */
const NEW_USER_ID = 'user-dev-admin';
/** The seed's own issuer, so the fixture's grants and these share one provenance. */
const ISSUER_USER_ID = 'user-seed-admin';
/** Fixed so a re-run does not rewrite `validFrom` on rows that already exist. */
const GRANT_VALID_FROM = new Date('2026-01-01T00:00:00.000Z');

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error('otpauth secret is not base32');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let at = 0; at + 8 <= bits.length; at += 8)
    bytes.push(Number.parseInt(bits.slice(at, at + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238, SHA-1, 6 digits, 30 s — the plugin's `totpOptions` in `server.ts`. */
function totp(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(at / 1000 / 30), 4);
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fff_ffff) % 1_000_000).padStart(6, '0');
}

function log(message: string): void {
  process.stdout.write(`[dev-admin] ${message}\n`);
}

function cookieHeaderFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0] ?? '')
    .filter((pair) => pair !== '')
    .join('; ');
}

async function main(): Promise<void> {
  // Guardrail first, before any database module is imported — the seed's own ordering.
  assertFixtureOnly();

  const email = process.env[DEV_ADMIN_EMAIL_VARIABLE]?.trim();
  const password = process.env.DEV_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      `${DEV_ADMIN_EMAIL_VARIABLE} and DEV_ADMIN_PASSWORD must both be set (see .env).`,
    );
  }
  if (!isDevAdminExempt(email)) {
    throw new Error('the exemption predicate refuses this environment; nothing was written.');
  }
  const rotateTotp = process.argv.includes('--rotate-totp');

  const {
    makeSystemContext,
    withAccessMatrixBootstrap,
    isSelfApprovalExempt,
    recordSelfApprovalExemption,
  } = await import('@qmulate/database');
  const { createPrivilegedPrismaClient, getPrivilegedBasePrismaClient } =
    await import('@qmulate/database');
  const { runAuditedTransaction } = await import('@qmulate/database/extensions/audit');

  const base = getPrivilegedBasePrismaClient();
  const waqfIds = (
    await base.waqf.findMany({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
  ).map((row) => row.id);
  const existing = await base.user.findUnique({ where: { email }, select: { id: true } });
  const userId = existing?.id ?? NEW_USER_ID;

  const actor = makeSystemContext({
    actorId: ISSUER_USER_ID,
    authorizedWaqfIds: waqfIds,
    requestId: 'dev-admin-setup',
    reason: 'local development administrator (fixture-only)',
  });
  const db = createPrivilegedPrismaClient(actor);
  const passwordHash = await hashPassword(password);
  const plan = devAdminGrantPlan(waqfIds);

  await runAuditedTransaction(base, actor, async (tx) => {
    const userData = {
      name: 'Development Administrator',
      email,
      emailVerified: true,
      isActive: true,
    };
    await db.user.upsert({
      where: { id: userId },
      create: { id: userId, ...userData },
      update: userData,
    });

    const accountId = `credacct-${userId}`;
    const accountData = {
      userId,
      accountId: userId,
      providerId: 'credential',
      password: passwordHash,
    };
    await db.account.upsert({
      where: { id: accountId },
      create: { id: accountId, ...accountData },
      update: accountData,
    });

    await withAccessMatrixBootstrap(tx.rawTx, async () => {
      for (const grant of plan) {
        const data = {
          permissions: [...grant.permissions],
          dataScopes: [...grant.dataScopes],
          canViewAmlRestricted: grant.canViewAmlRestricted,
          amlCompartment: grant.amlCompartment,
          beneficiarySelfId: null,
          scopeRefs: [],
          grantedByUserId: ISSUER_USER_ID,
          validUntil: null,
          revokedAt: null,
          deletedAt: null,
        };
        // Deterministic id, the seed's convention (`derivedId.grant`): a re-run converges the row.
        const id = `grant-${userId}-${grant.waqfId}-${grant.role.toLowerCase()}`;
        await db.waqfAccessGrant.upsert({
          where: { id },
          create: {
            id,
            userId,
            waqfId: grant.waqfId,
            role: grant.role as never,
            validFrom: GRANT_VALID_FROM,
            ...data,
          },
          update: data,
        });
      }
    });
  });
  log(
    `${existing ? 'updated' : 'created'} ${email}: ${String(plan.length)} grants across ${String(waqfIds.length)} endowments.`,
  );

  // ── Self-approval exemption (migration 54) ──────────────────────────────────────────────
  // A per-DATABASE setting, read from the catalog by `qmulate_self_approval_exempt()`. Only the
  // database owner or a superuser can write it; the migrator owns the schema, not the database, so
  // the owner connection is tried first and the platform superuser (`SUPERUSER_DATABASE_URL`, which
  // `dev-postgres --run` injects) is the fallback. Never printed, never read via `current_setting`.
  const migratorUrl = process.env.MIGRATOR_DATABASE_URL?.trim();
  if (!migratorUrl) throw new Error('MIGRATOR_DATABASE_URL is required to record the exemption.');
  const wroteOn = await recordSelfApprovalExemption(userId, {
    primaryUrl: migratorUrl,
    fallbackUrl: process.env.SUPERUSER_DATABASE_URL?.trim(),
  });
  if (!(await isSelfApprovalExempt(base, userId))) {
    throw new Error(
      'the self-approval exemption did not take effect (qmulate_self_approval_exempt returned false).',
    );
  }
  log(
    `self-approval exemption recorded on this database for the administrator (fixture-only; written on the ${wroteOn === 'primary' ? 'migrator' : 'superuser'} connection).`,
  );

  // ── TOTP, through better-auth's own path ────────────────────────────────────────────────
  const { getAuth } = await import('./server');
  const auth = getAuth();
  const enrolled =
    (
      await base.user.findUniqueOrThrow({
        where: { id: userId },
        select: { twoFactorEnabled: true },
      })
    ).twoFactorEnabled === true;

  if (enrolled && !rotateTotp) {
    log('TOTP already enrolled — kept (pass --rotate-totp to re-enrol).');
  } else {
    const signIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
    const headers = new Headers({ cookie: cookieHeaderFrom(signIn.headers) });
    if (headers.get('cookie') === '') throw new Error('sign-in returned no session cookie.');

    const enable = await auth.api.enableTwoFactor({ body: { password }, headers });
    const secret = new URL(enable.totpURI).searchParams.get('secret');
    if (!secret) throw new Error('enableTwoFactor returned no secret.');
    await auth.api.verifyTOTP({ body: { code: totp(secret) }, headers });
    await auth.api.signOut({ headers });

    const target = resolve(process.cwd(), LOCAL_TOTP_FILE);
    writeFileSync(
      target,
      JSON.stringify(
        {
          email,
          totpURI: enable.totpURI,
          backupCodes: enable.backupCodes,
          enrolledAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    log(
      `TOTP ${enrolled ? 're-' : ''}enrolled; otpauth URI and backup codes written to ${LOCAL_TOTP_FILE} (gitignored).`,
    );
  }

  const final = await base.user.findUniqueOrThrow({
    where: { id: userId },
    select: { twoFactorEnabled: true, emailVerified: true },
  });
  log(
    `state: emailVerified=${String(final.emailVerified)} twoFactorEnabled=${String(final.twoFactorEnabled)} fixture-only exemption=active`,
  );
  await base.$disconnect();
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[dev-admin] FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
