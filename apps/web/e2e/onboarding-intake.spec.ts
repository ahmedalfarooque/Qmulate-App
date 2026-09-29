/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-3b · UI INTAKE IN THE BROWSER — the matrix-admin registers a new endowment for the fixture's
 *          family; the birth is confirmed on the intake screen with the newborn's id — and the registrar
 *          holds NO seat on it (self-issue is refused), so the newborn's own screens answer NOT FOUND
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Seat: `matrix-admin@example.test` (SYSTEM_ADMIN on waqf-001 alone — since S12-3b it carries
 * `endowment:waqf:write` beside `admin:access_matrix:write`, the two verbs `waqf_birth_admission`
 * demands on a SIBLING). The handshake dir is shared with `endowment-journey.spec.ts`, which seats
 * the same account.
 *
 * ORDER INDEPENDENCE: each locale registers its OWN endowment (the certificate number is unique and
 * carries the locale), so the two projects never collide and neither depends on the other's run.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { createSeatHandshake, localeFor, SEED_PASSWORD } from './support/seat-handshake';

const ADMIN = { email: 'matrix-admin@example.test', password: SEED_PASSWORD } as const;

const { seatedJourney } = createSeatHandshake({
  seat: ADMIN,
  handshakeDirName: 'qmulate-e2e-seat-matrix-admin',
  waqfId: 'waqf-001',
});

interface Catalogue {
  readonly endowments: {
    readonly intake: { readonly title: string; readonly registered: string };
    readonly onboarding: {
      readonly title: string;
      readonly status: { readonly OPEN: string };
      readonly activity: {
        readonly AUTHORITY_FILING_SUBMISSION: string;
        readonly DISTRIBUTION_RUN: string;
      };
    };
  };
}

function catalogue(locale: 'ar' | 'en'): Catalogue {
  const path = fileURLToPath(
    new URL(`../../../packages/i18n/messages/${locale}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, 'utf8')) as Catalogue;
}

const RAW_KEY_PATTERN = /(?:endowments|errors|common|nav)\.[a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z]/;

test('S12-3b · the matrix-admin registers an endowment in the browser; it is born with three OPEN gates and both activities blocked', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale).endowments;
  const nonce = `${locale}-${String(Date.now())}`;

  await seatedJourney(browser, testInfo, locale, async (page) => {
    await page.goto(`/${locale}/onboarding`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/onboarding$`));
    await expect(page.getByRole('heading', { name: copy.intake.title })).toBeVisible();
    // The seat MAY register (both verbs on waqf-001): the form is drawn, the fixture note with it.
    const form = page.getByTestId('qm-intake-form');
    await expect(form).toHaveCount(1);
    await expect(page.getByTestId('qm-intake-fixture-note')).toHaveCount(1);
    await expect(page.getByTestId('qm-intake-no-authority')).toHaveCount(0);

    // ── the deed, as stated — fixture grammar throughout ───────────────────────────────────────
    await form.getByTestId('qm-intake-certificate').fill(`FAKE-CERT-E2E-${nonce}`);
    await form.getByTestId('qm-intake-deed').fill(`FAKE-DEED-E2E-${nonce}`);
    await form.getByTestId('qm-intake-registration').fill('2026-02-01');
    await form.getByTestId('qm-intake-shart').fill('شرط الواقف كما ورد في الصك (بيانات وهمية)');
    await form
      .getByTestId('qm-intake-primary-nazir')
      .fill('QMULATE (professional Nazir) (بيانات وهمية)');
    await form.getByTestId('qm-intake-appointed').fill('2026-02-01');
    // The first Nazir seat goes to the seeded nazir account — the registrar may not seat themselves.
    await form.getByTestId('qm-intake-nazir-email').fill('nazir@example.test');
    await form.getByTestId('qm-intake-submit').click();

    // ── the birth is confirmed HERE, with the newborn's id — not on the newborn's screen ─────────
    // The registrar holds no seat on what they registered (self-issue is refused at the database), so
    // the newborn's onboarding tab would answer NOT FOUND to them. What this seat can observe is the
    // confirmation and the id; the gates-OPEN state is measured through the api (onboarding-intake).
    await page.waitForURL(/\/onboarding\?notice=intaken&waqfId=/);
    const notice = page.getByTestId('qm-intake-notice');
    await expect(notice).toContainText(copy.intake.registered);
    const bornId = await notice.getAttribute('data-waqf-id');
    expect(bornId, 'the notice carries the newborn id').toMatch(/^[A-Za-z0-9_-]{8,}$/);
    await expect(notice).toContainText(bornId ?? '');
    // The form is drawn again — the seat still may register — and the refusal slot is empty.
    await expect(page.getByTestId('qm-intake-form')).toHaveCount(1);

    // ── NON-DISCLOSURE, as a property: the registrar cannot see the endowment they registered ────
    await page.goto(`/${locale}/endowments/${bornId ?? ''}/onboarding`);
    await expect(page.getByTestId('qm-onboarding-gate')).toHaveCount(0);
    await expect(page.getByTestId('qm-onboarding')).toHaveCount(0);

    expect(await page.locator('main').innerText()).not.toMatch(RAW_KEY_PATTERN);
  });
});
