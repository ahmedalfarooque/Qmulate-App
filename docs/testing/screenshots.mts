/* Screenshot harness for docs/testing/TESTING-GUIDE.md — fixture-only seats, throwaway cluster. */
import { chromium, type Page, type BrowserContext } from '../../apps/web/node_modules/@playwright/test/index.mjs';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.OUT ?? new URL('./screenshots/', import.meta.url).pathname;
/** FULLPAGE=0 takes viewport-only shots (used for the printed PDF); VIEWPORT_H sets the viewport height (default 900). */
const FULLPAGE = process.env.FULLPAGE !== '0';
const VIEWPORT_H = Number(process.env.VIEWPORT_H ?? 900);
const SECRETS = join(process.env.SCRATCH ?? '.', 'totp-secrets.json');
const PASSWORD = 'fixture-only-not-a-secret-9271';
mkdirSync(OUT, { recursive: true });

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`not base32: ${char}`);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let at = 0; at + 8 <= bits.length; at += 8) bytes.push(Number.parseInt(bits.slice(at, at + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(at / 1000 / 30), 4);
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fff_ffff;
  return String(binary % 1_000_000).padStart(6, '0');
}
const secrets: Record<string, string> = existsSync(SECRETS) ? JSON.parse(readFileSync(SECRETS, 'utf8')) : {};
const saveSecrets = () => writeFileSync(SECRETS, JSON.stringify(secrets, null, 2));

type Shot = { slug: string; path: string; locale?: 'ar' | 'en'; settle?: number };
type Seat = { key: string; email: string; shots: Shot[]; authShots?: boolean };

const PERIOD = 'periodStart=2026-01-01&periodEnd=2026-03-31';
const SEATS: Seat[] = [
  { key: 'nazir', email: 'nazir@example.test', authShots: true, shots: [
    { slug: 'dashboard', path: '/en/dashboard' },
    { slug: 'dashboard-ar', path: '/ar/dashboard', locale: 'ar' },
    { slug: 'dashboard-waqf-003-board', path: '/en/dashboard?waqf=waqf-003' },
    { slug: 'endowments', path: '/en/endowments' },
    { slug: 'endowment-waqf-001', path: '/en/endowments/waqf-001' },
    { slug: 'endowment-waqf-001-shart', path: '/en/endowments/waqf-001/shart' },
    { slug: 'endowment-waqf-001-deed', path: '/en/endowments/waqf-001/deed' },
    { slug: 'endowment-waqf-001-classification', path: '/en/endowments/waqf-001/classification' },
    { slug: 'endowment-waqf-005-beneficiaries', path: '/en/endowments/waqf-005/beneficiaries' },
    { slug: 'endowment-waqf-004-onboarding', path: '/en/endowments/waqf-004/onboarding' },
    { slug: 'endowment-waqf-004-reserved-matters', path: '/en/endowments/waqf-004/reserved-matters' },
    { slug: 'distributions', path: '/en/distributions' },
    { slug: 'distributions-waqf-001', path: '/en/distributions/waqf-001' },
    { slug: 'distributions-waqf-001-run-dist-001', path: '/en/distributions/waqf-001/runs/dist-001' },
    { slug: 'approvals', path: '/en/approvals' },
    { slug: 'financials', path: '/en/financials' },
    { slug: 'financials-waqf-001', path: '/en/financials?waqf=waqf-001' },
  ]},
  { key: 'accountant', email: 'accountant@example.test', shots: [
    { slug: 'wizard-period', path: `/en/distributions/waqf-001/new?${PERIOD}&step=period` },
    { slug: 'wizard-waterfall', path: `/en/distributions/waqf-001/new?${PERIOD}&step=waterfall` },
    { slug: 'wizard-lines', path: `/en/distributions/waqf-001/new?${PERIOD}&step=lines` },
    { slug: 'wizard-review', path: `/en/distributions/waqf-001/new?${PERIOD}&step=review` },
    { slug: 'wizard-review-waqf-005-halts', path: `/en/distributions/waqf-005/new?${PERIOD}&step=review` },
    { slug: 'wizard-lines-waqf-007-lineage', path: `/en/distributions/waqf-007/new?${PERIOD}&step=lines` },
  ]},
  { key: 'matrix-admin', email: 'matrix-admin@example.test', shots: [
    { slug: 'onboarding-intake', path: '/en/onboarding' },
    { slug: 'onboarding-intake-ar', path: '/ar/onboarding', locale: 'ar' },
    { slug: 'endowments', path: '/en/endowments' },
  ]},
  { key: 'clerk', email: 'clerk@example.test', shots: [
    { slug: 'endowment-waqf-004-onboarding', path: '/en/endowments/waqf-004/onboarding' },
    { slug: 'endowment-waqf-004-reserved-matters', path: '/en/endowments/waqf-004/reserved-matters' },
    { slug: 'endowments', path: '/en/endowments' },
  ]},
  { key: 'compliance', email: 'compliance@example.test', shots: [
    { slug: 'dashboard-waqf-003-red-board', path: '/en/dashboard?waqf=waqf-003' },
    { slug: 'endowment-waqf-004', path: '/en/endowments/waqf-004' },
  ]},
  { key: 'auditor', email: 'auditor@example.test', shots: [
    { slug: 'financials-waqf-001', path: '/en/financials?waqf=waqf-001' },
    { slug: 'financials-waqf-004-direct-use', path: '/en/financials?waqf=waqf-004' },
    { slug: 'endowments', path: '/en/endowments' },
  ]},
  { key: 'board', email: 'board@example.test', shots: [
    { slug: 'endowments', path: '/en/endowments' },
    { slug: 'endowment-waqf-001', path: '/en/endowments/waqf-001' },
  ]},
  { key: 'case-manager', email: 'case-manager@example.test', shots: [
    { slug: 'endowment-waqf-001-deed', path: '/en/endowments/waqf-001/deed' },
  ]},
  { key: 'admin', email: 'admin@example.test', shots: [
    { slug: 'dashboard', path: '/en/dashboard' },
    { slug: 'endowments', path: '/en/endowments' },
  ]},
  { key: 'unscoped', email: 'unscoped@example.test', shots: [
    { slug: 'dashboard', path: '/en/dashboard' },
    { slug: 'endowments', path: '/en/endowments' },
  ]},
  { key: 'beneficiary', email: 'beneficiary.ben-001@example.test', shots: [
    { slug: 'dashboard', path: '/en/dashboard' },
    { slug: 'endowments', path: '/en/endowments' },
  ]},
];

async function shoot(page: Page, name: string, settle = 600) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(settle);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: FULLPAGE });
  console.log('  shot', name, page.url());
}

async function signIn(context: BrowserContext, seat: Seat, first: boolean): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE}/en/sign-in`);
  if (first) await shoot(page, 'auth--sign-in');
  await page.fill('input[name="email"]', seat.email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/two-factor/, { timeout: 30_000 });
  await page.waitForSelector('input[name="password"], input[name="code"]', { timeout: 30_000 });
  await page.waitForTimeout(300);
  let secret = secrets[seat.email];
  const enrolPassword = page.locator('input[name="password"]');
  if (await enrolPassword.count()) {
    if (first) await shoot(page, 'auth--two-factor-enrol-password');
    await enrolPassword.fill(PASSWORD);
    await page.click('button[type="submit"]');
    const uri = await page.getByTestId('qm-totp-uri').textContent({ timeout: 30_000 });
    secret = new URL(uri!.trim()).searchParams.get('secret')!;
    secrets[seat.email] = secret; saveSecrets();
    if (first) await shoot(page, 'auth--two-factor-enrol-verify');
  } else if (!secret) {
    throw new Error(`${seat.email} is already enrolled but no secret is stored — reset the cluster`);
  }
  await page.fill('input[name="code"]', totp(secret));
  await page.click('form:has(input[name="code"]) button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  return page;
}

const only = process.argv.slice(2);
const browser = await chromium.launch();
let first = true;
for (const seat of SEATS) {
  if (only.length && !only.includes(seat.key)) continue;
  console.log('==', seat.key, seat.email);
  const context = await browser.newContext({ viewport: { width: 1440, height: VIEWPORT_H }, locale: 'en-SA', timezoneId: 'Asia/Riyadh' });
  try {
    const page = await signIn(context, seat, first && seat.authShots === true);
    first = false;
    for (const s of seat.shots) {
      await page.goto(`${BASE}${s.path}`, { timeout: 120_000 });
      await shoot(page, `${seat.key}--${s.slug}`, s.settle);
    }
  } catch (e) {
    console.error('!! failed on', seat.key, String(e));
    await context.pages()[0]?.screenshot({ path: join(OUT, `_FAILED--${seat.key}.png`), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
  }
}
await browser.close();
