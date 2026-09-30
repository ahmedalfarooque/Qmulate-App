/**
 * Marks ONE existing account as the PRIMARY ADMINISTRATOR (migration 55): ACTIVE, level ADMIN,
 * `isPrimaryAdmin = true`. The database then refuses to demote, disable or delete it while it is
 * the last such account. Run on an operator machine with the provisioning credential:
 *
 *   pnpm admin:primary <email>
 *
 * Reads `ACCESS_MATRIX_DATABASE_URL` (the provisioner — the only role allowed to write the
 * organisation columns) and `DATABASE_URL` (to look the account up). It creates nothing: the person
 * signs up through the ordinary form first, enrols their second factor, and is then promoted here.
 * No password, secret or token is read, written or printed.
 */
import process from 'node:process';

async function main(): Promise<void> {
  const email = process.argv.slice(2).find((arg) => arg !== '--')?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('usage: pnpm admin:primary <email>');
    process.exit(2);
  }
  const { getBasePrismaClient, setPrimaryAdmin, makeSystemContext } = await import('@qmulate/database');

  const base = getBasePrismaClient();
  const user = await base.user.findUnique({
    where: { email },
    select: { id: true, status: true, isPrimaryAdmin: true, twoFactorEnabled: true },
  });
  if (user === null) {
    console.error(`[admin:primary] no account with email ${email}. Sign up through the application first.`);
    process.exit(1);
  }
  if (user.isPrimaryAdmin && user.status === 'ACTIVE') {
    console.warn(`[admin:primary] ${email} is already the primary administrator (status ACTIVE).`);
    await base.$disconnect();
    return;
  }

  // The actor of this audited write is the operator's SYSTEM context: an operator holding the
  // provisioning credential is the authority here, and the audit row names the operation.
  const actor = makeSystemContext({
    actorId: null,
    authorizedWaqfIds: [],
    requestId: 'admin-primary-setup',
    reason: 'primary administrator designation by the operator (migration 55)',
  });
  await setPrimaryAdmin(actor, { userId: user.id });

  const after = await base.user.findUnique({
    where: { id: user.id },
    select: { status: true, isPrimaryAdmin: true, accessLevel: { select: { key: true } } },
  });
  console.warn(
    `[admin:primary] ${email}: status=${after?.status} isPrimaryAdmin=${after?.isPrimaryAdmin} ` +
      `level=${after?.accessLevel?.key ?? 'none'} twoFactorEnrolled=${user.twoFactorEnabled === true}`,
  );
  await base.$disconnect();
}

main().catch((error: unknown) => {
  console.error('[admin:primary] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
