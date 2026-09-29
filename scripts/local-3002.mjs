import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const stateDir = join(root, '.pgdata', 'local-3002');
const databaseDir = join(stateDir, 'database');
const secretFile = join(stateDir, 'secrets.json');
const readyFile = join(stateDir, 'seed-complete');
const databaseRequire = createRequire(join(root, 'packages/database/package.json'));
const webRequire = createRequire(join(root, 'apps/web/package.json'));

async function assertFree(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is already in use; stop the existing local launcher first.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function run(script, args, env, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Local command failed with exit ${code}`)));
  });
}

await assertFree(3002);
await assertFree(54462);
mkdirSync(stateDir, { recursive: true });
if (!existsSync(secretFile)) {
  writeFileSync(secretFile, JSON.stringify({
    databasePassword: randomBytes(24).toString('hex'),
    authSecret: randomBytes(48).toString('base64'),
    encryptionKey: randomBytes(32).toString('base64'),
    hmacKey: randomBytes(32).toString('base64'),
  }), { flag: 'wx', mode: 0o600 });
}
const secrets = JSON.parse(readFileSync(secretFile, 'utf8'));
const url = (role) => `postgresql://${role}:${secrets.databasePassword}@127.0.0.1:54462/qmulate_local_3002?schema=public`;
const runtimeEnv = { ...process.env,
  DATA_CLASSIFICATION: 'fixture-only', DATA_RESIDENCY: 'non-ksa',
  DATABASE_URL: url('qmulate_app'), ACCESS_MATRIX_DATABASE_URL: url('qmulate_provisioner'),
  BETTER_AUTH_SECRET: secrets.authSecret, BETTER_AUTH_URL: 'http://localhost:3002',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3002', NEXT_PUBLIC_DEFAULT_LOCALE: 'ar',
  FIELD_ENCRYPTION_KEYS: JSON.stringify({ '1': secrets.encryptionKey }),
  FIELD_ENCRYPTION_ACTIVE_KEY: '1', FIELD_HMAC_KEY: secrets.hmacKey,
  PORT: '3002', NODE_ENV: 'development',
};
for (const key of ['MIGRATOR_DATABASE_URL', 'SUPERUSER_DATABASE_URL', 'PGBOSS_DATABASE_URL', 'TEST_ONLY_DISABLE_AUTH_RATE_LIMIT']) delete runtimeEnv[key];
const setupEnv = { ...runtimeEnv, MIGRATOR_DATABASE_URL: url('qmulate_owner'), SUPERUSER_DATABASE_URL: url('qmulate_local'), PGBOSS_DATABASE_URL: url('qmulate_pgboss') };
Object.assign(process.env, setupEnv);
const postgres = new EmbeddedPostgres({ databaseDir, user: 'qmulate_local', password: secrets.databasePassword, port: 54462, persistent: true, onLog: () => {}, onError: (message) => console.error(message) });
let web;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (web && web.exitCode === null) web.kill();
  await postgres.stop();
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
try {
  if (!existsSync(join(databaseDir, 'PG_VERSION'))) await postgres.initialise();
  await postgres.start();
  try { await postgres.createDatabase('qmulate_local_3002'); }
  catch (error) { if (!/already exists/i.test(String(error))) throw error; }
  const { provisionDatabaseRoles } = await import('../packages/database/src/provision-roles.ts');
  await provisionDatabaseRoles({ superuserUrl: setupEnv.SUPERUSER_DATABASE_URL, appUrl: runtimeEnv.DATABASE_URL, provisionerUrl: runtimeEnv.ACCESS_MATRIX_DATABASE_URL, migratorUrl: setupEnv.MIGRATOR_DATABASE_URL, pgbossUrl: setupEnv.PGBOSS_DATABASE_URL, ownerCreateDb: false });
  const prisma = databaseRequire.resolve('prisma/build/index.js');
  const databaseCwd = join(root, 'packages/database');
  await run(prisma, ['generate'], setupEnv, databaseCwd);
  await run(prisma, ['migrate', 'deploy'], { ...setupEnv, DATABASE_URL: setupEnv.MIGRATOR_DATABASE_URL }, databaseCwd);
  if (!existsSync(readyFile)) {
    await run('--import', ['tsx', 'packages/database/src/seed.ts'], setupEnv);
    writeFileSync(readyFile, new Date().toISOString(), { flag: 'wx' });
  }
  console.log('\nQmulate local fixture app: http://localhost:3002/en/sign-in\n');
  web = spawn(process.execPath, [webRequire.resolve('next/dist/bin/next'), 'dev', '--hostname', 'localhost', '--port', '3002'], { cwd: join(root, 'apps/web'), env: runtimeEnv, stdio: 'inherit', windowsHide: true });
  await new Promise((resolve, reject) => { web.once('error', reject); web.once('exit', (code) => code === 0 || stopping ? resolve() : reject(new Error(`Web server exited ${code}`))); });
} finally {
  await stop();
}
