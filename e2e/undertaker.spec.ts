// @spec undertaker#4 The data crossing panel.
// @spec undertaker#4.2 Prompt 66 done when: the data crossing panel shows every table with a
// matching count. A recorded run of Shifa: the real Undertaker moved its four data files.
import { expect, test } from '@playwright/test';
import { API, raiseShifa } from './helpers/raise';

const FILES = ['MEDICINE.DBF', 'CUSTOMER.DBF', 'BILLS.DBF', 'BILLITEM.DBF'];

test('the data crossing: every table crossed whole, and every total matches', async ({ page }) => {
  const id = await raiseShifa(page, { recorded: true });
  const panel = page.getByTestId('data-crossing');
  await expect(panel.getByRole('heading', { name: 'Data crossing' })).toBeVisible();
  const reconciliation = panel.getByTestId('reconciliation');
  await expect(reconciliation).toBeVisible({ timeout: 30_000 });
  await expect(reconciliation.locator('caption')).toHaveText(
    'Every total matches exactly: nothing was lost or changed on the way.',
  );
  for (const file of FILES) {
    const table = panel.getByTestId(`crossing-table-${file}`);
    const text = (await table.innerText()).replace(/\s+/g, ' ');
    const m = /(\d+) of (\d+) records crossed/.exec(text);
    expect(m, `${file}: ${text}`).not.toBeNull();
    expect(m![1], file).toBe(m![2]);
    await expect(table.getByRole('progressbar')).toHaveAttribute('aria-valuenow', m![2]!);
    // Its count in the reconciliation: old and new the same, ticked.
    const row = reconciliation
      .getByTestId('reconciliation-line')
      .filter({ hasText: file })
      .filter({ hasText: 'records' });
    await expect(row).toHaveAttribute('data-ok', 'true');
    const cells = await row.getByRole('cell').allInnerTexts();
    expect(cells[2]).toBe(cells[3]);
  }
  await expect(reconciliation.locator('[data-ok="false"]')).toHaveCount(0);
  await expect(reconciliation.getByText('stock value')).toBeVisible();
  await expect(panel.getByTestId('crossing-rejected')).toHaveCount(0);
  // Done: the slips have stopped.
  await expect(panel.getByTestId('crossing-slip')).toHaveCount(0);
  await page.request.delete(`${API}/api/projects/${id}`);
});
