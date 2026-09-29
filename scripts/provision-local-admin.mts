// Explicit owner provisioning for the isolated fixture database only. Never imported by the app.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const secrets = JSON.parse(readFileSync(join(root, '.pgdata/local-3002/secrets.json'), 'utf8'));
const url = (role: string) => `postgresql://${role}:${secrets.databasePassword}@127.0.0.1:54462/qmulate_local_3002?schema=public`;
Object.assign(process.env, {
  DATABASE_URL: url('qmulate_app'), MIGRATOR_DATABASE_URL: url('qmulate_owner'),
  DATA_CLASSIFICATION: 'fixture-only', DATA_RESIDENCY: 'non-ksa',
  BETTER_AUTH_SECRET: secrets.authSecret, BETTER_AUTH_URL: 'http://localhost:3002',
  FIELD_ENCRYPTION_KEYS: JSON.stringify({ '1': secrets.encryptionKey }),
  FIELD_ENCRYPTION_ACTIVE_KEY: '1', FIELD_HMAC_KEY: secrets.hmacKey,
});
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { email, password } = JSON.parse(input);
if (email !== 'arshad@alfarooque.com' || typeof password !== 'string' || password.length < 12) {
  throw new Error('Expected the authorized local administrator and a strong password on stdin.');
}
const authRequire = createRequire(join(root, 'packages/auth/package.json'));
const { hashPassword } = await import(pathToFileURL(authRequire.resolve('better-auth/crypto')).href);
const { getPrivilegedBasePrismaClient, createPrivilegedPrismaClient } = await import('../packages/database/src/client.js');
const { makeSystemContext } = await import('../packages/database/src/context.js');
const { runAuditedTransaction } = await import('../packages/database/src/extensions/audit.js');
const { withAccessMatrixBootstrap } = await import('../packages/database/src/access-matrix-bootstrap.js');
const { ROLE_PRESETS } = await import('../packages/domain/src/access.js');
const base = getPrivilegedBasePrismaClient();
try {
  const [target] = await base.$queryRawUnsafe<Array<{ name: string }>>('SELECT current_database() AS name');
  if (target?.name !== 'qmulate_local_3002') throw new Error('Refusing a non-local-fixture database.');
  const waqfs = await base.waqf.findMany({ where: { deletedAt: null }, select: { id: true } });
  const actorId = 'local-admin-provisioning';
  const ctx = makeSystemContext({ actorId, authorizedWaqfIds: waqfs.map(w => w.id), requestId: randomUUID(), reason: 'Owner-authorized local fixture administrator provisioning' });
  const db = createPrivilegedPrismaClient(ctx);
  const passwordHash = await hashPassword(password);
  const existing = await base.user.findUnique({ where: { email }, select: { id: true } });
  const userId = existing?.id ?? randomUUID();
  const roles = ['admin', 'nazir', 'case_manager', 'finance', 'compliance_officer', 'aml_officer', 'counsel'] as const;
  await runAuditedTransaction(base, ctx, async auditTx => {
    await auditTx.rawTx.user.upsert({ where: { email }, create: { id: userId, email, name: 'Arshad', locale: 'en', isActive: true }, update: { isActive: true } });
    await auditTx.rawTx.account.upsert({ where: { providerId_accountId: { providerId: 'credential', accountId: userId } }, create: { id: randomUUID(), userId, accountId: userId, providerId: 'credential', password: passwordHash }, update: { password: passwordHash } });
    await auditTx.rawTx.session.deleteMany({ where: { userId } });
    await withAccessMatrixBootstrap(auditTx.rawTx, async () => {
      for (const waqf of waqfs) for (const role of roles) {
        const data = { userId, waqfId: waqf.id, role: (role === 'admin' ? 'SYSTEM_ADMIN' : role.toUpperCase()) as any, permissions: [...ROLE_PRESETS[role]], dataScopes: [...new Set(ROLE_PRESETS[role].map(p => p.split(':')[0]!))], scopeRefs: [], grantedByUserId: actorId, createdBy: actorId, validFrom: new Date(), validUntil: null, revokedAt: null, deletedAt: null, amlCompartment: role === 'aml_officer', canViewAmlRestricted: role === 'aml_officer' };
        const previous = await auditTx.rawTx.waqfAccessGrant.findUnique({ where: { userId_waqfId_role: { userId, waqfId: waqf.id, role: data.role } }, select: { id: true } });
        await db.waqfAccessGrant.upsert({ where: { id: previous?.id ?? randomUUID() }, create: data, update: data });
      }
    });
  });
  const grants = await base.waqfAccessGrant.count({ where: { userId, deletedAt: null, revokedAt: null } });
  const guards = await base.$queryRawUnsafe<Array<{ tgenabled: string }>>("SELECT tgenabled FROM pg_trigger WHERE tgname = 'waqf_access_grant_admission'");
  if (guards.length !== 1 || guards[0]?.tgenabled !== 'A') throw new Error('Admission guard verification failed.');
  console.log(JSON.stringify({ email, endowments: waqfs.length, grants, admissionGuard: 'ENABLE ALWAYS', mfaRequired: true }));
} finally { await base.$disconnect(); }
