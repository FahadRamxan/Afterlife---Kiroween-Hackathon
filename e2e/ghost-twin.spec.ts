// @spec ghost-twin#4 The Ghost Twin tab.
// @spec ghost-twin#3.2 Prompt 78 done when: an e2e test runs a simulated week (time travel in demo
// mode) and then switches over.
// @spec ghost-twin#4.2 Prompt 79 done when: the e2e test simulates a day and sees readiness rise.
// A recorded run of Shifa; each "Simulate a day in the shop" adds one day of the week the real
// 1998 app wrote in headless js-dos (pnpm twin:record), and the worker replays it in the reborn app.
import { expect, test } from '@playwright/test';
import { API, raiseShifa } from './helpers/raise';
test('simulate a day, see readiness rise; simulate the week, then switch over', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const id = await raiseShifa(page, { recorded: true });
  await page.getByRole('tab', { name: 'Ghost Twin', exact: true }).click();
  const tab = page.getByTestId('ghost-twin');
  const meter = tab.getByTestId('twin-readiness');
  await expect(meter).toHaveAttribute('data-score', '0', { timeout: 30_000 });
  await expect(tab.getByTestId('twin-primary')).toHaveAttribute('data-primary', 'old');
  // Not ready: the switch-over cannot be pressed yet.
  const switchBtn = tab.getByRole('button', { name: 'Switch over to the reborn app' });
  await expect(switchBtn).toBeDisabled();
  // One day in the shop: its candle lights green once every transaction matched.
  await tab.getByRole('button', { name: 'Simulate a day in the shop (1998-07-15)' }).click();
  await expect(tab.getByTestId('twin-notice')).toContainText('1998-07-15');
  const day1 = tab.locator('[data-testid="twin-day"][data-date="1998-07-15"]');
  await expect(day1).toHaveAttribute('data-candle', 'matched', { timeout: 120_000 });
  const score = Number(await meter.getAttribute('data-score'));
  expect(score).toBeGreaterThan(0);
  expect(score).toBeLessThan(100);
  // The feed: each pair is what the old app wrote and what the reborn app made of it.
  const pair = tab.getByTestId('twin-pair').first();
  await expect(pair).toHaveAttribute('data-outcome', 'matched');
  await expect(pair).toContainText('Old app:');
  await expect(pair).toContainText('Reborn app: matched');
  // The rest of the week, a day at a time.
  for (let d = 16; d <= 21; d++) {
    const day = `1998-07-${d}`;
    await tab.getByRole('button', { name: `Simulate a day in the shop (${day})` }).click();
    await expect(tab.locator(`[data-testid="twin-day"][data-date="${day}"]`)).toHaveAttribute(
      'data-candle',
      'matched',
      { timeout: 120_000 },
    );
  }
  await expect(
    tab.getByRole('button', { name: 'Every recorded day has been simulated' }),
  ).toBeDisabled();
  await expect(tab.getByTestId('twin-days')).toHaveText('7 of 7 days of shadow use');
  await expect(tab.getByTestId('twin-mismatched')).toHaveText('No open mismatches');
  await expect(meter).toHaveAttribute('data-score', '100', { timeout: 60_000 });
  await expect(tab.getByTestId('twin-ready')).toBeVisible();
  // Switching over asks first; "Not yet" leaves the old app in charge.
  await switchBtn.click();
  const confirm = tab.getByRole('alertdialog', { name: 'Switch the shop to the reborn app?' });
  await confirm.getByRole('button', { name: 'Not yet' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(tab.getByTestId('twin-primary')).toHaveAttribute('data-primary', 'old');
  await switchBtn.click();
  await confirm.getByRole('button', { name: 'Yes, switch over' }).click();
  await expect(tab.getByTestId('twin-primary')).toHaveAttribute('data-primary', 'vessel');
  await expect(tab.getByTestId('twin-notice')).toContainText('Switched over.');
  await expect(switchBtn).toHaveCount(0);
  // The old app's data is frozen: the capture tool's next change is refused.
  const token = (await (await page.request.post(`${API}/api/projects/${id}/twin/token`)).json())
    .token as string;
  const late = await page.request.post(`${API}/api/projects/${id}/twin/events`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      seq: 100_000,
      occurredAt: '1998-07-22T09:00:00.000Z',
      files: ['BILLS.DBF'],
      diff: { tables: {}, unchanged: [], addedTables: [], removedTables: [] },
    },
  });
  expect(late.status()).toBe(409);
});
test('the Ghost Twin tab in Urdu: right to left, the readiness meter named', async ({ page }) => {
  await raiseShifa(page, { recorded: true });
  await page
    .context()
    .addCookies([{ name: 'afterlife-locale', value: 'ur', url: 'http://localhost:3000' }]);
  await page.goto(`${page.url()}?tab=ghost-twin`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  const tab = page.getByTestId('ghost-twin');
  await expect(tab.getByRole('progressbar', { name: 'منتقلی کی تیاری' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
