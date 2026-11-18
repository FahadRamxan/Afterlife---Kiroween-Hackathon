import { expect, test } from '@playwright/test';

const sections = [
  'palette',
  'type',
  'button',
  'card',
  'tombstone',
  'crt',
  'crtscreen',
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
    // Prompt 24: the layout's id. The same screen always gets the same one.
    const fp = await section.getByTestId('screen-fingerprint').innerText();
    expect(fp).toMatch(/^fp_[0-9a-f]{16}$/);
    await page.reload();
    await expect(section.getByTestId('screen-fingerprint')).toHaveText(fp);
  });

  test('CrtScreen draws the recorded Shifa bill with its overlays', async ({ page }) => {
    const section = page.getByTestId('ds-crtscreen');
    const crt = section.getByRole('region', { name: 'Shifa Medical Store, 1998, recorded run' });
    await expect(crt).toContainText('PANADOL 500MG STRIP');
    await expect(crt).toContainText('NEW BILL');
    // 25 rows of 80 columns fit the frame: nothing is cut off on the right.
    const frame = (await crt.boundingBox())!;
    const lastRow = (await crt.locator('[data-crt-row="24"]').boundingBox())!;
    expect(lastRow.x + lastRow.width).toBeLessThanOrEqual(frame.x + frame.width);
    await expect(crt.locator('[data-crt-row]')).toHaveCount(25);
    // The overlays are there, and said in words.
    await expect(section.locator('[data-crt-highlight="true"]')).toBeVisible();
    await expect(section.locator('.ghost-cursor')).toBeVisible();
    await expect(section.locator('.data-pulse')).toBeVisible();
    await expect(section).toContainText('Field Code is highlighted. Data changed on row 7.');
    // The title bar is in the app's own colours: bright white on cyan.
    const title = crt.locator('[data-crt-row="0"] span').first();
    await expect(title).toHaveCSS('background-color', 'rgb(0, 170, 170)');
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

  test('the CRT scanlines, glow, ghost cursor, flame and data pulse do not animate', async ({
    page,
  }) => {
    await page.goto('/design');
    for (const sel of [
      '.crt-scanlines',
      '.crt-glow',
      '.ghost-cursor',
      '.candle-flame',
      '.data-pulse',
    ]) {
      const name = await page
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).animationName);
      expect(name, sel).toBe('none');
    }
    // Without the pulse the changed data keeps its candle outline, so the meaning stays.
    await expect(page.locator('.data-pulse').first()).toHaveCSS('outline-style', 'solid');
  });

  test('with motion allowed they do animate', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.goto('/design');
    for (const sel of ['.crt-scanlines', '.data-pulse']) {
      const name = await page
        .locator(sel)
        .first()
        .evaluate((el) => getComputedStyle(el).animationName);
      expect(name, sel).not.toBe('none');
    }
    await ctx.close();
  });
});
