import { expect, test } from '@playwright/test';

/**
 * AC-E0-3 / AC-E0-4 — the themed shell renders correctly in both directions.
 *
 * These assertions are deliberately structural (attributes, computed styles, geometry)
 * rather than copy-based: message keys are still landing in `@qmulate/i18n`, and a test
 * that asserts on English strings would both break on translation and quietly stop
 * testing anything once the copy changed.
 */

type Expected = { locale: 'ar' | 'en'; dir: 'rtl' | 'ltr'; nuDir: string };

function expectationsFor(projectName: string): Expected {
  return projectName === 'ar'
    ? { locale: 'ar', dir: 'rtl', nuDir: '-1' }
    : { locale: 'en', dir: 'ltr', nuDir: '1' };
}

test.describe('themed app shell', () => {
  test('renders with the correct lang and dir on the root element', async ({ page }, testInfo) => {
    const { locale, dir } = expectationsFor(testInfo.project.name);

    await page.goto(`/${locale}`);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', locale);
    await expect(html).toHaveAttribute('dir', dir);
  });

  test('flips the neumorphic light source in RTL', async ({ page }, testInfo) => {
    const { locale, nuDir } = expectationsFor(testInfo.project.name);

    await page.goto(`/${locale}`);

    // The light source is inline-start, so the shadow X offsets mirror with direction.
    // Y offsets never change — that is what `--nu-dir` (an X multiplier) encodes.
    const resolved = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--nu-dir').trim(),
    );
    expect(resolved).toBe(nuDir);
  });

  test('renders the shell chrome: topbar, scope switcher and primary nav', async ({
    page,
  }, testInfo) => {
    const { locale } = expectationsFor(testInfo.project.name);

    await page.goto(`/${locale}`);

    await expect(page.getByTestId('qm-topbar')).toBeVisible();
    await expect(page.getByTestId('qm-scope-switcher')).toBeVisible();

    const sidebar = page.getByTestId('qm-sidebar');
    await expect(sidebar).toBeVisible();
    // The ten Phase-1 surfaces, however many of them are built yet — plus, since S12-3b, the intake
    // entry ("Register an endowment"): a birth has no endowment tab to live under, so it is top-level.
    await expect(sidebar.locator('li')).toHaveCount(11);
  });

  test('never scrolls horizontally', async ({ page }, testInfo) => {
    const { locale } = expectationsFor(testInfo.project.name);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/${locale}`);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  });

  test('Arabic labels are never uppercased or letter-spaced', async ({ page }, testInfo) => {
    const { locale } = expectationsFor(testInfo.project.name);

    await page.goto(`/${locale}`);

    // The scope switcher's eyebrow — a real in-page label, not the offscreen skip link.
    const label = page.getByTestId('qm-scope-switcher').locator('.qm-label').first();
    await expect(label).toBeVisible();

    const { textTransform, letterSpacing, fontFamily } = await label.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        textTransform: style.textTransform,
        letterSpacing: style.letterSpacing,
        fontFamily: style.fontFamily,
      };
    });

    if (locale === 'ar') {
      // Uppercasing or tracking Arabic breaks the cursive joins.
      expect(textTransform).toBe('none');
      expect(['normal', '0px']).toContain(letterSpacing);
      expect(fontFamily).toContain('IBM Plex Sans Arabic');
    } else {
      expect(textTransform).toBe('uppercase');
      expect(letterSpacing).not.toBe('normal');
      expect(letterSpacing).not.toBe('0px');
    }
  });

  test('focus is a solid ring, and the skip link is the first stop', async ({ page }, testInfo) => {
    const { locale } = expectationsFor(testInfo.project.name);

    await page.goto(`/${locale}`);
    await page.keyboard.press('Tab');

    const skipLink = page.locator('.qm-skip-link');
    await expect(skipLink).toBeFocused();

    const boxShadow = await skipLink.evaluate((element) => getComputedStyle(element).boxShadow);
    // The focus token is two solid rings (bg spacer + blue), never a blurred glow: every
    // shadow in `--focus-ring` has a 0px blur radius.
    expect(boxShadow).not.toBe('none');
    expect(boxShadow).toContain('0px 0px 0px');
  });

  test('the locale switch moves between ar and en, preserving the path', async ({
    page,
  }, testInfo) => {
    const { locale } = expectationsFor(testInfo.project.name);
    const other = locale === 'ar' ? 'en' : 'ar';

    await page.goto(`/${locale}`);
    await page.locator(`button[lang="${other}"]`).click();

    await expect(page).toHaveURL(new RegExp(`/${other}$`));
    await expect(page.locator('html')).toHaveAttribute('lang', other);
  });
});
