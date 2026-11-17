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
  'decoder',
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

  test('the screen decoder reads the recorded Shifa frame exactly', async ({ page }) => {
    const section = page.getByTestId('ds-decoder');
    await expect(section.getByRole('img', { name: /Shifa main menu, recorded run/ })).toBeVisible();
    const text = section.getByLabel('Decoded text');
    await expect(text).toContainText('SHIFA MEDICAL STORE  v2.3');
    await expect(text).toContainText('1  New Bill');
    await expect(text).toContainText('15/07/98');
    await expect(section.getByTestId('decoder-stats')).toContainText('2,000 cells read, 0 unknown');
    // Prompt 23: what the screen means.
    const model = section.getByTestId('screen-model');
    await expect(model).toContainText('MAIN MENU');
    await expect(model).toContainText('Menu (numbered)');
    await expect(model).toContainText(
      '1 New Bill · 2 Stock · 3 Customers · 4 Daily Report · 5 Exit',
    );
    await expect(model).toContainText('Choice: (prompt');
    await expect(model).toContainText('1-5 Select');
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
