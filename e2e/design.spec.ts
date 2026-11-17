import { expect, test } from '@playwright/test';

const sections = [
  'palette',
  'type',
  'button',
  'card',
  'tombstone',
  'crt',
  'dbftable',
  'dbfdiff',
  'diff',
  'candle',
  'certificate',
];

test.describe('/design', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design');
    await page.evaluate(() => document.fonts.ready);
  });

  test('shows every design system component', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Haunted Ledger' })).toBeVisible();
    for (const s of sections) await expect(page.getByTestId(`ds-${s}`)).toBeVisible();
    await expect(page.getByRole('region', { name: /running live/ })).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Proof cases', exact: true }),
    ).toHaveAttribute('aria-valuenow', '1284');
  });

  test('the Shifa demos use the catalogue years (1998 to 2004)', async ({ page }) => {
    await expect(page.getByTestId('ds-tombstone')).toContainText('1998–2004');
    await expect(page.getByTestId('ds-certificate')).toContainText('Died 2004');
    await expect(page.getByTestId('ds-tombstone')).toContainText('Satellite Town, Rawalpindi');
    await expect(page.locator('main')).not.toContainText('2009');
  });

  for (const s of sections) {
    test(`snapshot: ${s}`, async ({ page }) => {
      await expect(page.getByTestId(`ds-${s}`)).toHaveScreenshot(`${s}.png`, {
        animations: 'disabled',
      });
    });
  }
});

test.describe('/design with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the CRT scanlines, glow, ghost cursor and flame do not animate', async ({ page }) => {
    await page.goto('/design');
    for (const sel of ['.crt-scanlines', '.crt-glow', '.ghost-cursor', '.candle-flame']) {
      const name = await page
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).animationName);
      expect(name, sel).toBe('none');
    }
  });

  test('with motion allowed they do animate', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.goto('/design');
    const name = await page
      .locator('.crt-scanlines')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(name).not.toBe('none');
    await ctx.close();
  });
});
