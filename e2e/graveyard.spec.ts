import { expect, test } from '@playwright/test';

const apps = [
  { id: 'shifa', name: 'Shifa Medical Store', years: '1998–2004', screen: 'SHIFA MEDICAL STORE' },
  { id: 'iqra', name: 'Iqra School Fees', years: '2001–2006', screen: 'IQRA SCHOOL FEES' },
  {
    id: 'barkat',
    name: 'Barkat Kiryana Ledger',
    years: '1996–2001',
    screen: 'BARKAT KIRYANA LEDGER',
  },
];

test.describe('/graveyard', () => {
  test('shows one tombstone per dead app, with years, story and preview', async ({ page }) => {
    await page.goto('/graveyard');
    await expect(page.getByRole('heading', { level: 1, name: 'The Graveyard' })).toBeVisible();
    const stones = page.getByTestId('tombstone');
    await expect(stones).toHaveCount(3);
    for (const [i, app] of apps.entries()) {
      const stone = stones.nth(i);
      await expect(stone.getByRole('heading', { name: app.name })).toBeVisible();
      await expect(stone).toContainText(app.years);
      await expect(stone.getByTestId('story')).not.toBeEmpty();
      const crt = stone.getByRole('region', { name: new RegExp(`${app.name}.*dormant`) });
      await expect(crt).toBeVisible();
      await expect(crt).toContainText(app.screen);
    }
    await expect(page.getByText(/written by our team/)).toBeVisible();
  });

  for (const app of apps) {
    test(`Raise ${app.id} opens /raise/${app.id}`, async ({ page }) => {
      await page.goto('/graveyard');
      const link = page.getByRole('link', { name: `Raise ${app.name}` });
      await expect(link).toHaveAttribute('href', `/raise/${app.id}`);
      await link.click();
      // With 10 workers on a cold server, the first render of /raise/<id> can take more than the
      // 5 s default (ci:local flaked twice on this line, then passed on retry in 0.7 s).
      await expect(page).toHaveURL(new RegExp(`/raise/${app.id}$`), { timeout: 15_000 });
      await expect(
        page.getByRole('heading', { level: 1, name: `Raising ${app.name}` }),
      ).toBeVisible();
    });
  }

  test('the upload card takes only a real zip', async ({ page }) => {
    await page.goto('/graveyard');
    const card = page.getByTestId('upload-card');
    await expect(card.getByRole('heading', { name: 'Upload your own dead app' })).toBeVisible();
    const input = card.getByLabel('Choose a zip with the EXE and DBF files');

    await input.setInputFiles({
      name: 'myapp.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ'),
    });
    await expect(card.getByRole('alert')).toContainText('Choose a .zip file');

    await input.setInputFiles({
      name: 'myapp.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK\x03\x04'),
    });
    // Since Prompt 21 the card also looks inside the zip (e2e/dbf-inspect.spec.ts).
    await expect(card.getByRole('alert')).toHaveText('That file is not a real zip.');
  });

  test('works at 360 px wide: one column, no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/graveyard');
    const stones = page.getByTestId('tombstone');
    await expect(stones).toHaveCount(3);
    const [a, b] = [await stones.nth(0).boundingBox(), await stones.nth(1).boundingBox()];
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1); // stacked, not side by side
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the dormant fog drifts, and stops under reduced motion', async ({ browser }) => {
    for (const [motion, expected] of [
      ['no-preference', 'fog-drift'],
      ['reduce', 'none'],
    ] as const) {
      const ctx = await browser.newContext({ reducedMotion: motion });
      const page = await ctx.newPage();
      await page.goto('/graveyard');
      const name = await page
        .locator('.graveyard-fog')
        .first()
        .evaluate((el) => getComputedStyle(el).animationName);
      expect(name, motion).toBe(expected);
      await ctx.close();
    }
  });

  test('in Urdu the page and the Raise buttons are translated', async ({ page, context }) => {
    await context.addCookies([
      { name: 'afterlife-locale', value: 'ur', url: 'http://localhost:3000' },
    ]);
    await page.goto('/graveyard');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1, name: 'قبرستان' })).toBeVisible();
    await expect(page.getByRole('link', { name: /زندہ کریں/ })).toHaveCount(3);
    // The era stories are English data, so they are marked as English for screen readers.
    await expect(page.getByTestId('story').first()).toHaveAttribute('lang', 'en');
  });

  test('in Urdu, English and numbers keep their left-to-right order and their own font', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: 'afterlife-locale', value: 'ur', url: 'http://localhost:3000' },
    ]);
    await page.goto('/graveyard');
    const stone = page.getByTestId('tombstone').first();
    // "1998–2004" must not be shown as "2004–1998", nor "R.I.P." as ".R.I.P".
    for (const text of ['1998–2004', 'R.I.P.']) {
      const el = stone.getByText(text, { exact: true });
      await expect(el).toHaveCSS('direction', 'ltr');
      await expect(el).toHaveCSS('unicode-bidi', 'isolate');
    }
    // English names, stories and the disclosure are left to right, in Inter, not Nastaliq.
    for (const el of [
      stone.getByRole('heading').first(),
      stone.getByTestId('place'),
      stone.getByTestId('story'),
      page.getByText(/written by our team/),
    ]) {
      await expect(el).toHaveCSS('direction', 'ltr');
      await expect(el).toHaveCSS('font-family', /Inter/);
    }
    // The DOS screen preview stays left to right: "1  New Bill", not "New Bill  1".
    await expect(stone.locator('pre')).toHaveCSS('direction', 'ltr');
    // Urdu text keeps the Urdu font.
    await expect(page.getByRole('heading', { level: 1, name: 'قبرستان' })).toHaveCSS(
      'font-family',
      /Nastaliq/,
    );
  });
});
