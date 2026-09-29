/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-2 · THE BR-1102 CHAIN IN THE BROWSER — recorded by staff, in both locales, the sign disabled
 *         until the last required step lands (§10 §9 · BR-1102 · BR-1103)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Owner rulings 2026-09-08, verbatim: "staff" (who records the principal's consent) and "every
 * matter" (counsel review on every reserved matter). This journey, on the seeded clerk seat
 * (`clerk@example.test`, COMPLIANCE_OFFICER on waqf-004 alone — see `SEED_USERS`):
 *
 *   1. raises a kinded reserved matter through the real tRPC endpoint (the tab has no "raise" form);
 *   2. sees it BLOCKED, with the sign disabled and BOTH missing steps named in the catalogue's words;
 *   3. records the principal's written consent against a reference → one step left, named;
 *   4. records the counsel review → "awaits the Nazir's signature", no record form remains.
 *
 * The subject carries the LOCALE, so the `ar` and `en` projects raise two different matters on one
 * endowment and never race each other on the one-open-per-subject index.
 *
 * What this file does NOT do: approve. The sign is the Nazir's and is proven at the api layer
 * (`reserved-matter-chain.integration.test.ts`), where the plane and the trigger are measured directly.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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
    readonly reserved: {
      readonly blockedBadge: string;
      readonly signBlockedTitle: string;
      readonly signReady: string;
      readonly stepSaved: string;
      readonly chainEnforced: string;
      readonly chainStep: { readonly PRINCIPAL_CONSENT: string; readonly COUNSEL_REVIEW: string };
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

/** Raise a kinded reserved matter through the real endpoint, on the seat's own session cookie. */
async function raiseMatter(
  context: BrowserContext,
  subjectId: string,
  locale: string,
): Promise<string> {
  const response = await context.request.post('/api/trpc/approval.initiate', {
    headers: { 'content-type': 'application/json', 'x-qmulate-locale': locale },
    data: {
      waqfId: WAQF_ID,
      type: 'RESERVED_MATTER',
      reservedMatterKind: 'DEED_IDENTITY',
      subjectId,
      payload: {
        kind: 'e2e.reservedChain',
        waqfId: WAQF_ID,
        locale,
        note: 'S12-2 browser journey (بيانات وهمية)',
      },
    },
  });
  const body = (await response.json()) as {
    result?: { data?: { approvalRequestId?: string; status?: string } };
    error?: { message?: string };
  };
  expect(
    response.status(),
    `approval.initiate refused the clerk: ${JSON.stringify(body.error ?? body)}`,
  ).toBe(200);
  expect(body.result?.data?.status).toBe('PENDING');
  const id = body.result?.data?.approvalRequestId;
  expect(id, 'no approvalRequestId came back').toBeTruthy();
  return id as string;
}

async function recordStep(
  page: Page,
  card: ReturnType<Page['locator']>,
  step: 'PRINCIPAL_CONSENT' | 'COUNSEL_REVIEW',
  reference: string,
): Promise<void> {
  const form = card.locator(`[data-testid="qm-reserved-record-form"][data-step="${step}"]`);
  await expect(form).toHaveCount(1);
  await form.getByTestId('qm-reserved-reference').fill(reference);
  await form.getByTestId('qm-reserved-record-save').click();
  await page.waitForURL(/notice=chainStepRecorded/);
}

test("S12-2 · staff record the BR-1102 chain in the browser; the sign is disabled until the last step, in the catalogue's words", async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale).endowments.reserved;

  await seatedJourney(browser, testInfo, locale, async (page, context) => {
    const subjectId = `waqf:${WAQF_ID}:e2e-chain:${locale}:${String(Date.now())}`;
    await raiseMatter(context, subjectId, locale);

    const path = `/${locale}/endowments/${WAQF_ID}/reserved-matters`;
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));

    const card = page.getByTestId('qm-reserved-matter').filter({ hasText: subjectId });
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('data-blocked', 'true');
    await expect(card.getByTestId('qm-reserved-blocked')).toHaveText(copy.blockedBadge);

    // ── 2 · BLOCKED: the sign is disabled and BOTH missing steps are named ─────────────────────
    await expect(card.getByTestId('qm-reserved-chain-enforced')).toHaveText(copy.chainEnforced);
    const blocked = card.getByTestId('qm-reserved-sign-blocked');
    await expect(blocked).toBeVisible();
    await expect(blocked).toHaveAttribute('data-missing', 'PRINCIPAL_CONSENT,COUNSEL_REVIEW');
    await expect(blocked.getByText(copy.signBlockedTitle)).toBeVisible();
    await expect(blocked.getByTestId('qm-reserved-missing-step')).toHaveCount(2);
    await expect(blocked.getByText(copy.chainStep.PRINCIPAL_CONSENT)).toBeVisible();
    await expect(blocked.getByText(copy.chainStep.COUNSEL_REVIEW)).toBeVisible();
    await expect(card.getByTestId('qm-reserved-sign-ready')).toHaveCount(0);
    // The clerk holds the write verb, so the record forms are DRAWN — one per missing step.
    await expect(card.getByTestId('qm-reserved-record-form')).toHaveCount(2);
    // Every step row still reads "not recorded".
    await expect(
      card.locator('[data-testid="qm-reserved-chain"] li[data-step="PRINCIPAL_CONSENT"]'),
    ).toHaveAttribute('data-chain-state', 'NOT_RECORDED');

    // ── 3 · the principal's written consent arrives; staff record it ────────────────────────────
    const boardReference = `FAKE-BOARD-LETTER-${locale}`;
    await recordStep(page, card, 'PRINCIPAL_CONSENT', boardReference);
    await expect(page.getByTestId('qm-reserved-notice')).toHaveText(copy.stepSaved);

    const cardAfterOne = page.getByTestId('qm-reserved-matter').filter({ hasText: subjectId });
    await expect(cardAfterOne).toHaveAttribute('data-blocked', 'true');
    await expect(cardAfterOne.getByTestId('qm-reserved-sign-blocked')).toHaveAttribute(
      'data-missing',
      'COUNSEL_REVIEW',
    );
    const principalRow = cardAfterOne.locator(
      '[data-testid="qm-reserved-chain"] li[data-step="PRINCIPAL_CONSENT"]',
    );
    await expect(principalRow).toHaveAttribute('data-chain-state', 'RECORDED');
    await expect(principalRow.getByTestId('qm-reserved-step-recorded')).toContainText(
      boardReference,
    );
    await expect(principalRow.getByTestId('qm-reserved-step-recorded')).toContainText(
      'user-reserved-clerk-001',
    );
    await expect(cardAfterOne.getByTestId('qm-reserved-record-form')).toHaveCount(1);

    // ── 4 · the counsel review arrives; the chain is complete; the sign awaits the Nazir ───────
    await recordStep(page, cardAfterOne, 'COUNSEL_REVIEW', `FAKE-COUNSEL-MEMO-${locale}`);
    const cardAfterTwo = page.getByTestId('qm-reserved-matter').filter({ hasText: subjectId });
    await expect(cardAfterTwo).toHaveAttribute('data-blocked', 'true'); // still PENDING — the sign is the Nazir's
    await expect(cardAfterTwo.getByTestId('qm-reserved-sign-blocked')).toHaveCount(0);
    await expect(cardAfterTwo.getByTestId('qm-reserved-sign-ready')).toHaveText(copy.signReady);
    await expect(cardAfterTwo.getByTestId('qm-reserved-record-form')).toHaveCount(0);
    await expect(
      cardAfterTwo.locator('[data-testid="qm-reserved-chain"] li[data-step="COUNSEL_REVIEW"]'),
    ).toHaveAttribute('data-chain-state', 'RECORDED');

    // No raw catalogue key leaked onto the screen (NFR-01).
    expect(await page.locator('main').innerText()).not.toMatch(RAW_KEY_PATTERN);
  });
});
