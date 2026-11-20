// Prompt 59 done when: a full bill made in the Vessel, with its totals checked. The reborn app is
// the Vessel runtime running the reference Soul of Shifa, on the old app's own data files. The
// expected totals are worked out by hand from the rules (10% off over Rs 5,000, 17% GST after the
// discount, both truncated to the paisa).
import { expect, test, type Page } from '@playwright/test';
import { SHIFA_REFERENCE_SOUL } from '../packages/soul/src/examples/shifa';

const API = 'http://localhost:4000';

async function openVessel(page: Page) {
  await page.goto('/graveyard');
  await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const id = page.url().split('/').at(-1)!;
  const res = await page.request.post(`${API}/api/projects/${id}/souls`, {
    data: SHIFA_REFERENCE_SOUL,
  });
  expect(res.status()).toBe(201);
  await page.goto(`/raise/${id}?tab=soul`);
  await page.getByRole('link', { name: 'Open the reborn app' }).click();
  await expect(page).toHaveURL(new RegExp(`/vessel/${id}$`));
  await expect(page.getByTestId('vessel-app')).toBeVisible({ timeout: 30_000 });
  return id;
}

const total = (page: Page, field: string) =>
  page.getByTestId('vessel-totals').getByTestId(`vessel-total-${field}`);

test.describe('the reborn app', () => {
  test.setTimeout(120_000);

  test('makes a full bill: search, tap, quantities, the running total, save; the stock goes down', async ({
    page,
  }) => {
    const id = await openVessel(page);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Shifa Medical Store' }),
    ).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Reborn app' });
    await expect(nav.getByRole('button')).toHaveText(['New bill', 'Stock', 'Customers']);
    await expect(nav.getByRole('button', { name: 'New bill' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByLabel('Customer (blank: walk-in)').fill('C0002');
    // Search as you type: four letters find the insulin.
    const find = page.getByRole('combobox', { name: 'Add a Medicine' });
    await find.fill('insu');
    await page
      .getByRole('option')
      .getByRole('button', { name: /INSULIN MIXTARD 10ML/ })
      .click();
    const lines = page.getByTestId('vessel-bill-line');
    await expect(lines).toHaveCount(1);
    for (let i = 0; i < 7; i++)
      await page.getByRole('button', { name: 'One more on line 1' }).click();
    await expect(page.getByLabel('Quantity on line 1')).toHaveValue('8');
    await expect(lines.first().getByTestId('vessel-line-amount')).toHaveText('5,200.00');
    await expect(total(page, 'SUBTOTAL')).toContainText('5,200.00');
    await expect(total(page, 'DISCOUNT')).toContainText('520.00');
    await expect(total(page, 'GST')).toContainText('795.60');
    await expect(total(page, 'TOTAL')).toContainText('5,475.60');

    // A strip of Panadol by its code and Enter: 5,212.50, 10% off is 521.25, GST on 4,691.25 is
    // 797.5125, truncated to 797.51; total 5,488.76.
    await find.fill('pan5');
    await find.press('Enter');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(1)).toContainText('PANADOL 500MG STRIP');
    await expect(total(page, 'SUBTOTAL')).toContainText('5,212.50');
    await expect(total(page, 'DISCOUNT')).toContainText('521.25');
    await expect(total(page, 'GST')).toContainText('797.51');
    await expect(total(page, 'TOTAL')).toContainText('5,488.76');

    await page.getByRole('button', { name: 'Save bill' }).click();
    await expect(page.getByTestId('vessel-saved')).toHaveText(
      'Bill 9807-0001 saved. Total Rs 5,488.76.',
    );
    await expect(lines).toHaveCount(0);

    // The stock list: 12 - 8 insulin, 240 - 1 Panadol.
    await nav.getByRole('button', { name: 'Stock' }).click();
    const stock = page.getByTestId('vessel-table-medicine');
    await expect(stock.getByRole('row').filter({ hasText: 'INS100' })).toContainText('4');
    await expect(stock.getByRole('row').filter({ hasText: 'PAN500' })).toContainText('239');
    await page.getByRole('searchbox', { name: 'Search' }).fill('insulin');
    await expect(stock.getByRole('row')).toHaveCount(2);

    await page.request.delete(`${API}/api/projects/${id}`);
  });

  test('an expired batch is refused on its line, and the bill cannot be saved', async ({
    page,
  }) => {
    const id = await openVessel(page);
    await page.getByRole('combobox', { name: 'Add a Medicine' }).fill('septran');
    await page.getByRole('option').first().getByRole('button').click();
    await expect(page.getByTestId('vessel-bill-line').first().getByRole('alert')).toContainText(
      'A medicine whose batch has expired cannot be added to a bill.',
    );
    await expect(page.getByRole('button', { name: 'Save bill' })).toBeDisabled();
    await page.request.delete(`${API}/api/projects/${id}`);
  });

  test('on a phone the menu is at the bottom with big buttons; in Urdu its words are Urdu', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await openVessel(page);
    const nav = page.getByRole('navigation', { name: 'Reborn app' });
    const box = (await nav.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(844 - 2);
    const tab = (await nav.getByRole('button', { name: 'Stock' }).boundingBox())!;
    expect(tab.height).toBeGreaterThanOrEqual(48);
    await page
      .getByRole('group', { name: 'Language' })
      .getByRole('button', { name: 'اردو' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
    await expect(page.getByRole('navigation', { name: 'نئی ایپ' }).getByRole('button')).toHaveText([
      'نیا بل',
      'اسٹاک',
      'گاہک',
    ]);
    await page.request.delete(`${API}/api/projects/${id}`);
  });

  test('on a desktop the menu is a sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const id = await openVessel(page);
    const nav = (await page.getByRole('navigation', { name: 'Reborn app' }).boundingBox())!;
    const view = (await page.getByRole('heading', { level: 2, name: 'New bill' }).boundingBox())!;
    expect(nav.x + nav.width).toBeLessThanOrEqual(view.x);
    expect(nav.height).toBeGreaterThan(nav.width / 2);
    await page.request.delete(`${API}/api/projects/${id}`);
  });
});
