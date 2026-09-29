/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-3 · V-11 IN THE BROWSER — an Authority filing is BLOCKED while Gate 02 is open, the gate is
 *         cleared on the onboarding tab in the catalogue's words, and the filing goes through
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Subject: waqf-004, the fixture's onboarding-state endowment (Gate 01 cleared, Gate 02 OPEN, a
 * dedicated account opened and unused). Seat: the clerk (`clerk@example.test`, COMPLIANCE_OFFICER on
 * waqf-004 — carries `compliance:filing:write` to ATTEMPT the filing and `endowment:waqf:write` to
 * clear the gate; no approve, no sign).
 *
 * ORDER INDEPENDENCE across the two locales: clearing a gate is a recorded act one project performs
 * and the other then FINDS. So the journey branches on what the endpoint says first — refused
 * (this project clears the gate and retries) or admitted (the other project already did; this
 * project asserts the CLEARED state and the unblocked board in its own locale). Both branches are
 * measurements; neither is vacuous.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type BrowserContext } from '@playwright/test';

import { createSeatHandshake, localeFor, SEED_PASSWORD } from './support/seat-handshake';

const CLERK = { email: 'clerk@example.test', password: SEED_PASSWORD } as const;
const WAQF_ID = 'waqf-004';

const { seatedJourney } = createSeatHandshake({
  seat: CLERK,
  handshakeDirName: 'qmulate-e2e-seat-clerk',
  waqfId: WAQF_ID,
});

interface Catalogue {
  readonly endowments: {
    readonly onboarding: {
      readonly title: string;
      readonly nothingBlocked: string;
      readonly cleared: string;
      readonly status: { readonly OPEN: string; readonly CLEARED: string };
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

/** Attempt the filing through the real endpoint; returns the HTTP status and the body as text. */
async function attemptFiling(
  context: BrowserContext,
  locale: string,
): Promise<{ status: number; body: string }> {
  const response = await context.request.post('/api/trpc/filing.requestSubmission', {
    headers: { 'content-type': 'application/json', 'x-qmulate-locale': locale },
    data: { waqfId: WAQF_ID, platform: 'AWQAF_DIGITAL' },
  });
  return { status: response.status(), body: await response.text() };
}

test('S12-3 · V-11 · a filing is blocked while Gate 02 is open; the clerk clears the gate in the browser; the filing goes through', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale).endowments.onboarding;

  await seatedJourney(browser, testInfo, locale, async (page, context) => {
    const first = await attemptFiling(context, locale);
    const path = `/${locale}/endowments/${WAQF_ID}/onboarding`;
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();

    const gate02 = page.locator(
      '[data-testid="qm-onboarding-gate"][data-gate="GATE_02_SYSTEMS_CONTROLS"]',
    );
    await expect(gate02).toHaveCount(1);

    const gateBlocks = first.status === 403 && /ONBOARDING_GATE_NOT_CLEARED/.test(first.body);
    if (!gateBlocks) {
      // The other locale's project cleared the gate first and its request went through — so this
      // attempt is either admitted (200) or refused as a DUPLICATE of the approval already PENDING
      // (409 ALREADY_OPEN). Both say the gate no longer blocks. Assert the CLEARED state in THIS locale.
      expect(first.body).not.toMatch(/ONBOARDING_GATE_NOT_CLEARED/);
      expect([200, 409], first.body).toContain(first.status);
      if (first.status === 409) expect(first.body).toMatch(/ALREADY_OPEN/);
      await expect(gate02).toHaveAttribute('data-status', 'CLEARED');
      await expect(gate02.getByTestId('qm-onboarding-gate-status')).toHaveText(copy.status.CLEARED);
      await expect(page.getByTestId('qm-onboarding-nothing-blocked')).toHaveText(
        copy.nothingBlocked,
      );
      await expect(page.getByTestId('qm-onboarding-blocked-activity')).toHaveCount(0);
      expect(await page.locator('main').innerText()).not.toMatch(RAW_KEY_PATTERN);
      return;
    }

    // ── 1 · BLOCKED, and the endpoint said why ─────────────────────────────────────────────────
    expect(first.status, first.body).toBe(403);
    expect(first.body).toMatch(/ONBOARDING_GATE_NOT_CLEARED/);

    // ── 2 · the board shows the block, the gate OPEN, the form drawn to this seat ──────────────
    await expect(gate02).toHaveAttribute('data-status', 'OPEN');
    await expect(gate02.getByTestId('qm-onboarding-gate-status')).toHaveText(copy.status.OPEN);
    const blocked = page.getByTestId('qm-onboarding-blocked-activity');
    await expect(blocked).toHaveCount(2);
    await expect(page.getByText(copy.activity.AUTHORITY_FILING_SUBMISSION).first()).toBeVisible();
    await expect(page.getByText(copy.activity.DISTRIBUTION_RUN).first()).toBeVisible();
    const form = gate02.getByTestId('qm-onboarding-clear-form');
    await expect(form).toHaveCount(1);
    await expect(form.getByTestId('qm-onboarding-attest')).toHaveCount(5);
    // Gate 03 shows the ORDER refusal and no form: Gate 02 is not cleared.
    const gate03 = page.locator(
      '[data-testid="qm-onboarding-gate"][data-gate="GATE_03_PEOPLE_PROPERTY_CADENCE"]',
    );
    await expect(gate03.getByTestId('qm-onboarding-order-refusal')).toHaveAttribute(
      'data-refusal',
      'PRIOR_GATE_NOT_CLEARED',
    );
    await expect(gate03.getByTestId('qm-onboarding-clear-form')).toHaveCount(0);

    // ── 3 · the clerk attests the five items and clears the gate ──────────────────────────────
    for (const box of await form.getByTestId('qm-onboarding-attest').all()) await box.check();
    await form.getByTestId('qm-onboarding-clear-save').click();
    await page.waitForURL(/notice=gateCleared/);
    await expect(page.getByTestId('qm-onboarding-notice')).toHaveText(copy.cleared);
    const gate02After = page.locator(
      '[data-testid="qm-onboarding-gate"][data-gate="GATE_02_SYSTEMS_CONTROLS"]',
    );
    await expect(gate02After).toHaveAttribute('data-status', 'CLEARED');
    await expect(gate02After.getByTestId('qm-onboarding-gate-cleared')).toContainText(
      'user-reserved-clerk-001',
    );
    await expect(page.getByTestId('qm-onboarding-nothing-blocked')).toHaveText(copy.nothingBlocked);
    await expect(page.getByTestId('qm-onboarding-blocked-activity')).toHaveCount(0);
    // The clerk is not the Nazir, so no reopen form is drawn to this seat.
    await expect(gate02After.getByTestId('qm-onboarding-reopen-form')).toHaveCount(0);

    // ── 4 · completing the gate UNBLOCKS the filing — the block was the gate ──────────────────
    const second = await attemptFiling(context, locale);
    expect(second.status, second.body).toBe(200);
    expect(second.body).not.toMatch(/ONBOARDING_GATE_NOT_CLEARED/);

    expect(await page.locator('main').innerText()).not.toMatch(RAW_KEY_PATTERN);
  });
});
