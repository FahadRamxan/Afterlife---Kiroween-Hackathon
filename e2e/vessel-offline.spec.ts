// Prompt 60 done when: Playwright sets the context offline, makes 3 bills, goes back online and
// checks the server has them. Also: the app opens again offline (its shell from the service
// worker's cache, its records from IndexedDB), and two phones selling the same insulin offline
// put the stock change on the owner's review list.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { SHIFA_REFERENCE_SOUL } from '../packages/soul/src/examples/shifa';

const API = 'http://localhost:4000';

async function shifaWithSoul(page: Page) {
  await page.goto('/graveyard');
  await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const id = page.url().split('/').at(-1)!;
  const res = await page.request.post(`${API}/api/projects/${id}/souls`, {
    data: SHIFA_REFERENCE_SOUL,
  });
  expect(res.status()).toBe(201);
  return id;
}

/** The Vessel open on this page, its records on the phone and its shell kept for offline. */
async function open(page: Page, id: string) {
  await page.goto(`/vessel/${id}`);
  const app = page.getByTestId('vessel-app');
  await expect(app).toBeVisible({ timeout: 30_000 });
  await expect(app).toHaveAttribute('data-shell', 'kept', { timeout: 30_000 });
  return app;
}

async function sell(page: Page, search: string, qty: number) {
  await page.getByRole('combobox', { name: 'Add a Medicine' }).fill(search);
  await page.getByRole('option').first().getByRole('button').click();
  for (let i = 1; i < qty; i++)
    await page.getByRole('button', { name: 'One more on line 1' }).click();
  await expect(page.getByLabel('Quantity on line 1')).toHaveValue(String(qty));
  await page.getByRole('button', { name: 'Save bill' }).click();
  await expect(page.getByTestId('vessel-saved')).toBeVisible();
}

const serverRecords = async (page: Page, id: string) =>
  (await (await page.request.get(`${API}/api/projects/${id}/vessel/records`)).json())
    .files as Record<string, { values: Record<string, string> }[]>;

test.describe('the reborn app offline', () => {
  test.setTimeout(180_000);

  test('three bills made offline, kept through a reload, reach the server when back online', async ({
    page,
    context,
  }) => {
    const id = await shifaWithSoul(page);
    const app = await open(page, id);
    await context.setOffline(true);
    const banner = page.getByTestId('vessel-offline');
    await expect(banner).toContainText('Offline, saved on this phone.');

    await sell(page, 'insu', 1);
    await sell(page, 'pan5', 4);
    await sell(page, 'insu', 2);
    await expect(banner).toContainText('3 bills are waiting to be sent.');
    await expect(app).toHaveAttribute('data-waiting', '3');

    // The phone is switched off and on, still with no network: the app and its bills are there.
    await page.reload();
    await expect(page.getByTestId('vessel-app')).toHaveAttribute('data-waiting', '3', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('vessel-offline')).toContainText('3 bills are waiting');

    await context.setOffline(false);
    await expect(page.getByTestId('vessel-synced')).toContainText(
      '3 bills sent: everything is on the server.',
      { timeout: 30_000 },
    );
    const files = await serverRecords(page, id);
    const bills = files['BILLS.DBF']!.map((b) => b.values);
    expect(bills.slice(-3).map((b) => [b.BILL_NO, b.TOTAL])).toEqual([
      ['9807-0001', '760.50'],
      ['9807-0002', '58.50'],
      ['9807-0003', '1521.00'],
    ]);
    const stock = (code: string) =>
      files['MEDICINE.DBF']!.find((m) => m.values.CODE === code)!.values.QTY;
    expect(stock('INS100')).toBe('9');
    expect(stock('PAN500')).toBe('236');

    await page.request.delete(`${API}/api/projects/${id}`);
  });

  test('two phones sell the same insulin offline: both sales stand, and the change is to review', async ({
    browser,
  }) => {
    const contexts: BrowserContext[] = [await browser.newContext(), await browser.newContext()];
    const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
    const id = await shifaWithSoul(a!);
    await open(a!, id);
    await open(b!, id);
    for (const c of contexts) await c.setOffline(true);
    await sell(a!, 'insu', 2);
    await sell(b!, 'insu', 3);

    await contexts[0]!.setOffline(false);
    await expect(a!.getByTestId('vessel-synced')).toContainText('1 bill sent', { timeout: 30_000 });
    await contexts[1]!.setOffline(false);
    await expect(b!.getByTestId('vessel-synced')).toContainText(
      'Bill 9807-0001 on this phone is bill 9807-0002 on the server',
      { timeout: 30_000 },
    );
    const review = b!.getByTestId('vessel-review');
    await expect(review).toContainText('1 stock change to review');
    await expect(review.getByTestId('vessel-conflict')).toHaveText(
      'INS100 Qty: on this phone 12 to 9; on the server 10 to 7. (bill 9807-0002)',
    );
    // Phone B now has the server's records: 12 - 2 - 3.
    await b!
      .getByRole('navigation', { name: 'Reborn app' })
      .getByRole('button', { name: 'Stock' })
      .click();
    await expect(
      b!.getByTestId('vessel-table-medicine').getByRole('row').filter({ hasText: 'INS100' }),
    ).toContainText('7');
    await review.getByRole('button', { name: 'Checked' }).click();
    await expect(review).toHaveCount(0);
    expect(
      (await (await b!.request.get(`${API}/api/projects/${id}/vessel/conflicts`)).json()).conflicts,
    ).toEqual([]);

    await a!.request.delete(`${API}/api/projects/${id}`);
    for (const c of contexts) await c.close();
  });

  test('the Vessel can be installed: its manifest opens the project’s app, standalone', async ({
    page,
  }) => {
    const id = await shifaWithSoul(page);
    await open(page, id);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe(`/vessel/${id}/manifest.webmanifest`);
    const m = await (await page.request.get(href!)).json();
    expect(m).toMatchObject({
      start_url: `/vessel/${id}`,
      scope: '/vessel/',
      display: 'standalone',
    });
    expect(
      await page.evaluate(
        async () => (await navigator.serviceWorker.getRegistration('/vessel/'))?.scope,
      ),
    ).toMatch(/\/vessel\/$/);
    await page.request.delete(`${API}/api/projects/${id}`);
  });
});
