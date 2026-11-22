// @spec archaeologist-completion#3.3 The Archaeologist's own Soul runs the reborn app.
// Review of 51-60, findings 2 and 3 done when: a recorded run of Shifa (the real pipeline on the
// real 1998 app, with no language model, and the probe bills it typed into the old app) gives a
// Soul whose rules make a bill in the reborn app with the old app's numbers. Nobody posts a Soul.
import { expect, test } from '@playwright/test';
import { API } from './helpers/raise';

const total = (page: import('@playwright/test').Page, field: string) =>
  page.getByTestId('vessel-totals').getByTestId(`vessel-total-${field}`);

test('a recorded run’s own Soul, found without a model and probed in the old app, makes a bill', async ({
  page,
}) => {
  // A whole recorded run replays first (six steps, about a minute; more on a loaded machine).
  test.setTimeout(240_000);
  await page.goto('/graveyard');
  await page.getByRole('button', { name: 'Watch a recorded run of Shifa Medical Store' }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const id = page.url().split('/').at(-1)!;
  await expect(page.getByTestId('steps').getByRole('progressbar')).toHaveAccessibleName(
    /^6 of 6 steps run/,
    { timeout: 90_000 },
  );

  // The rules, as the Archaeologist found them: the discount over Rs 5,000 came from the probes.
  await page.getByRole('tab', { name: 'Soul', exact: true }).click();
  await expect(page.getByTestId('soul-reference')).toHaveCount(0);
  await expect(page.getByTestId('rule-bill-discount')).toContainText(
    'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.1, 2) else 0',
  );
  await expect(page.getByTestId('rule-bill-gst')).toContainText(
    'trunc((bill.subtotal - bill.discount) * 0.17, 2)',
  );

  await page.getByRole('link', { name: 'Open the reborn app' }).click();
  await expect(page).toHaveURL(new RegExp(`/vessel/${id}$`));
  await expect(page.getByTestId('vessel-app')).toBeVisible({ timeout: 30_000 });
  const find = page.getByRole('combobox', { name: 'Add a Medicine' });
  await find.fill('insu');
  await page
    .getByRole('option')
    .getByRole('button', { name: /INSULIN MIXTARD 10ML/ })
    .click();
  for (let i = 0; i < 7; i++)
    await page.getByRole('button', { name: 'One more on line 1' }).click();
  // The bill-discount run's numbers, as the real app wrote them in DOSBox.
  await expect(total(page, 'SUBTOTAL')).toContainText('5,200.00');
  await expect(total(page, 'DISCOUNT')).toContainText('520.00');
  await expect(total(page, 'GST')).toContainText('795.60');
  await expect(total(page, 'TOTAL')).toContainText('5,475.60');
  // (The menu's tab is named after the action too: this Soul's screens have no "NEW BILL" title.)
  await page.getByTestId('vessel-totals').getByRole('button', { name: 'Save bill' }).click();
  await expect(page.getByTestId('vessel-saved')).toHaveText(
    'Bill 9807-0001 saved. Total Rs 5,475.60.',
  );
  // Prompt 61: its receipt, in the layout the Archaeologist read off the old NEW BILL screen.
  const paper = page.getByTestId('receipt-paper');
  await expect(paper.getByRole('columnheader')).toHaveText([
    '#',
    'CODE',
    'NAME',
    'BATCH',
    'PRICE',
    'QTY',
    'AMOUNT',
  ]);
  await expect(paper).toContainText('INSULIN MIXTARD 10ML');
  await expect(paper).toContainText('Customer:WALK-IN');
  await page.request.delete(`${API}/api/projects/${id}`);
});
