import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * The sign-in surface, in both locales.
 *
 * Scoped to what is provable without a database: rendering, direction, the bidi islands,
 * and client-side constraint validation. The full register → enrol TOTP → sign-in journey
 * (AC-E0-7) needs a migrated, seeded Postgres and a TOTP generator, so it belongs in the
 * integration suite that runs after `prisma migrate deploy` + seed — not here, where a
 * missing database would look like a UI failure.
 *
 * Selectors are attribute-based on purpose: label copy lives in `@qmulate/i18n` and must
 * be free to change without breaking the suite.
 */

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * A GET THAT SURVIVES ONE TRANSPORT FAULT — AND NOTHING ELSE
 *
 * The same rule, and the same measurement, as the three journey specs (see
 * `endowment-journey.spec.ts` for the full note): CI run `31969864722` failed
 * `[ar] endowment-journey.spec.ts:898` with `apiRequestContext.get: socket hang up` in 22 ms, on a
 * GET that had not yet said anything about the product. A transport fault has no status and no body,
 * so it is not a verdict; an ANSWERED response — including a redirect, which is exactly what the
 * assertion below is about — is returned untouched. Duplicated per spec deliberately.
 * ────────────────────────────────────────────────────────────────────────────────────────── */

const TRANSPORT_FAULT =
  /socket hang up|ECONNRESET|EPIPE|socket disconnected|connection closed|connection was reset/i;

async function getSurvivingOneTransportFault(
  request: APIRequestContext,
  url: string,
  options?: { maxRedirects?: number },
): Promise<APIResponse> {
  try {
    return await request.get(url, options);
  } catch (first) {
    if (!TRANSPORT_FAULT.test(String(first))) throw first;
    console.log(`[e2e][transport] GET ${url} — ${String(first).slice(0, 120)} · ONE re-attempt`);
    await new Promise((done) => setTimeout(done, 250));
    try {
      return await request.get(url, options);
    } catch (second) {
      throw new Error(
        `GET ${url} failed at the TRANSPORT level TWICE — no status, no body, so this is not a ` +
          `statement about the product. first: ${String(first)} · second: ${String(second)}`,
      );
    }
  }
}

function localeFor(projectName: string): 'ar' | 'en' {
  return projectName === 'ar' ? 'ar' : 'en';
}

test.describe('sign-in', () => {
  test('renders the form with the correct direction', async ({ page }, testInfo) => {
    const locale = localeFor(testInfo.project.name);
    const dir = locale === 'ar' ? 'rtl' : 'ltr';

    await page.goto(`/${locale}/sign-in`);

    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', dir);

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('keeps credential fields as LTR islands even in Arabic', async ({ page }, testInfo) => {
    const locale = localeFor(testInfo.project.name);

    await page.goto(`/${locale}/sign-in`);

    // An email address and a password are Latin/numeric strings; rendering them RTL inside
    // an Arabic form is the same class of bug as a mirrored IBAN.
    await expect(page.locator('input[name="email"]')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('input[name="password"]')).toHaveAttribute('dir', 'ltr');
  });

  test('blocks submission of an empty form without leaving the page', async ({
    page,
  }, testInfo) => {
    const locale = localeFor(testInfo.project.name);

    await page.goto(`/${locale}/sign-in`);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in$`));
    const emailIsValid = await page
      .locator('input[name="email"]')
      .evaluate((element) => (element as HTMLInputElement).checkValidity());
    expect(emailIsValid).toBe(false);
  });

  test('rejects a malformed email address client-side', async ({ page }, testInfo) => {
    const locale = localeFor(testInfo.project.name);

    await page.goto(`/${locale}/sign-in`);
    await page.locator('input[name="email"]').fill('not-an-email');
    await page.locator('input[name="password"]').fill('correct-horse-battery');
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in$`));
    const emailIsValid = await page
      .locator('input[name="email"]')
      .evaluate((element) => (element as HTMLInputElement).checkValidity());
    expect(emailIsValid).toBe(false);
  });

  test('every control clears the 44px minimum hit target', async ({ page }, testInfo) => {
    const locale = localeFor(testInfo.project.name);

    await page.goto(`/${locale}/sign-in`);

    for (const selector of [
      'input[name="email"]',
      'input[name="password"]',
      'button[type="submit"]',
    ]) {
      const box = await page.locator(selector).boundingBox();
      expect(box, selector).not.toBeNull();
      expect(box?.height ?? 0, selector).toBeGreaterThanOrEqual(44);
    }
  });

  test('offers the language toggle before authentication', async ({ page }, testInfo) => {
    const locale = localeFor(testInfo.project.name);
    const other = locale === 'ar' ? 'en' : 'ar';

    await page.goto(`/${locale}/sign-in`);
    await page.locator(`button[lang="${other}"]`).click();

    await expect(page).toHaveURL(new RegExp(`/${other}/sign-in$`));
    await expect(page.locator('html')).toHaveAttribute('lang', other);
  });
});

test.describe('auth API routing', () => {
  test('/api/auth/** is not locale-prefixed by the i18n middleware', async ({ request }) => {
    // AC-E0-8. A 307 to /ar/api/auth/... would strip the request body and break every
    // sign-in POST in a way that reads like a credentials bug. The assertion is on the
    // ABSENCE of a redirect, not on a success code: whether the handler answers 200 or
    // errors depends on the database, which this suite deliberately does not require.
    const response = await getSurvivingOneTransportFault(request, '/api/auth/get-session', {
      maxRedirects: 0,
    });

    expect([301, 302, 303, 307, 308]).not.toContain(response.status());
    expect(response.headers()['location']).toBeUndefined();
  });
});
