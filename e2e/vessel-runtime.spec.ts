// Prompt 58: the Vessel runtime, on the Soul tab. The reference Soul of Shifa runs on the old
// app's own data files (read out of its js-dos bundle); the bill is the scripted "bill-discount"
// run, and the numbers are the ones the real 1998 app wrote in DOSBox for it.
import { expect, test, type Page } from '@playwright/test';
import { API, raiseShifaWithSoul } from './helpers/raise';

async function shifaWithSoul(page: Page) {
  const id = await raiseShifaWithSoul(page);
  await page.goto(`/raise/${id}?tab=soul`);
  const panel = page.getByTestId('vessel-tryout');
  await expect(panel).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  return { id, panel };
}

test.describe('the Vessel runtime', () => {
  test('saves the bill-discount bill with the old app’s numbers, and shows what changed', async ({
    page,
  }) => {
    const { id, panel } = await shifaWithSoul(page);
    await expect(panel).toContainText(
      'Worked out by the Soul: BILL_NO, BILL_DATE, SUBTOTAL, DISCOUNT, GST, TOTAL',
    );
    await panel.getByLabel('CUST_ID').fill('C0002');
    const line = panel.getByTestId('vessel-line').first();
    await line.getByLabel('CODE').fill('INS100');
    await line.getByLabel('QTY').fill('8');
    await panel.getByRole('button', { name: 'Run “Save a bill”' }).click();

    const result = panel.getByTestId('vessel-result');
    const value = (f: string) => result.getByTestId(`vessel-value-${f}`);
    await expect(value('BILL_NO')).toContainText('9807-0001');
    await expect(value('BILL_DATE')).toContainText('19980715');
    await expect(value('SUBTOTAL')).toContainText('5200.00');
    await expect(value('DISCOUNT')).toContainText('520.00');
    await expect(value('GST')).toContainText('795.60');
    await expect(value('TOTAL')).toContainText('5475.60');
    // The same diff view as the old app's: the new bill, its line, and the stock 12 -> 4.
    const grid = (name: string) => result.getByRole('grid', { name });
    await expect(grid('BILLS.DBF (Bill): what the action changed')).toBeVisible();
    await expect(grid('BILLITEM.DBF (Bill line): what the action changed')).toBeVisible();
    const stock = grid('MEDICINE.DBF (Medicine): what the action changed');
    await expect(stock).toBeVisible();
    await expect(stock.getByRole('row').filter({ hasText: 'INS100' })).toContainText('4');
    await expect(result).toContainText('INS100');

    // The next bill on the same records gets the next number, and two lines.
    await line.getByLabel('QTY').fill('1');
    await panel.getByRole('button', { name: 'Add a line' }).click();
    const second = panel.getByTestId('vessel-line').nth(1);
    await second.getByLabel('CODE').fill('PAN500');
    await second.getByLabel('QTY').fill('4');
    await panel.getByRole('button', { name: 'Run “Save a bill”' }).click();
    await expect(value('BILL_NO')).toContainText('9807-0002');
    await expect(value('SUBTOTAL')).toContainText('700.00');
    await expect(value('GST')).toContainText('119.00');

    await page.request.delete(`${API}/api/projects/${id}`);
  });

  test('an expired batch is refused in the rule’s own words, and nothing is saved', async ({
    page,
  }) => {
    const { id, panel } = await shifaWithSoul(page);
    const line = panel.getByTestId('vessel-line').first();
    await line.getByLabel('CODE').fill('SEP200');
    await line.getByLabel('QTY').fill('1');
    await panel.getByRole('button', { name: 'Run “Save a bill”' }).click();
    const refused = panel.getByTestId('vessel-refused');
    await expect(refused).toContainText(
      'Line 1: A medicine whose batch has expired cannot be added to a bill.',
    );
    // Nothing was saved: the next good bill is still the first of July.
    await line.getByLabel('CODE').fill('PAN500');
    await panel.getByRole('button', { name: 'Run “Save a bill”' }).click();
    await expect(panel.getByTestId('vessel-value-BILL_NO')).toContainText('9807-0001');
    await page.request.delete(`${API}/api/projects/${id}`);
  });
});
