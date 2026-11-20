// Prompt 55: candidate rules checked against every observation. The observation is real: a bill
// for one strip of Panadol (Rs 12.50) typed into the live Shifa EXE as a séance. GST on it is
// 2.125: the old app wrote 2.12, so the truncating rule is kept and the rounding one (2.13) is not.
import { expect, test } from '@playwright/test';

const API = 'http://localhost:4000';

test.describe('rule verification', () => {
  test('checks candidates on a real bill: keeps the truncated GST, asks for a 5000 probe', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/graveyard');
    await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
    await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const projectId = page.url().split('/').at(-1)!;

    const seance = page.getByRole('region', { name: 'Record a séance' });
    await seance.getByRole('button', { name: 'Record a séance' }).click();
    await expect(seance.getByTestId('seance-screen')).toHaveText('MAIN MENU', { timeout: 60_000 });
    await seance
      .getByRole('application', { name: 'Shifa Medical Store keyboard: type here' })
      .click();
    // New bill, walk-in customer, PAN500 x 1, end of lines, F2 saves it.
    const keys = ['1', 'Enter', ...'PAN500'.split(''), 'Enter', '1', 'Enter', 'Enter', 'F2'];
    for (const key of keys) {
      await page.keyboard.press(key);
      await expect(seance.getByText(/keys? waiting/)).toHaveCount(0, { timeout: 20_000 });
    }
    const save = seance.getByRole('button', { name: `Save the séance (${keys.length} actions)` });
    await save.click({ timeout: 30_000 });
    await expect(seance.getByTestId('seance-saved')).toBeVisible();

    // The project's observations: the séance's, and any the live possession made. The bill is the
    // séance's (possession here stops before it saves one).
    const targets = await (
      await page.request.get(`${API}/api/projects/${projectId}/rules/targets`)
    ).json();
    expect(targets.observations).toBeGreaterThanOrEqual(keys.length);
    expect(targets.targets).toContainEqual({
      target: 'bill.gst',
      kind: 'inserted',
      effects: 1,
      observations: 1,
    });
    const run = `Check against ${targets.observations} observations`;

    await page.getByRole('tab', { name: 'Soul', exact: true }).click();
    const check = page.getByTestId('rule-check');
    await expect(check).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
    const target = check.getByLabel('Value the old app wrote');
    await target.selectOption('bill.gst');
    await expect(target.locator('option:checked')).toHaveText('bill.gst: 1 value in 1 observation');
    await check
      .getByLabel('Candidate rules, one per line (up to 10)')
      .fill(
        [
          'round((bill.subtotal - bill.discount) * 0.17, 2)',
          'trunc((bill.subtotal - bill.discount) * 0.17, 2)',
          'trunc(bill.subtotal * 0.18, 2)',
        ].join('\n'),
      );
    await check.getByRole('button', { name: run }).click();

    const result = check.getByTestId('rule-check-result');
    await expect(result.getByTestId('rule-check-selected')).toContainText(
      'trunc((bill.subtotal - bill.discount) * 0.17, 2)',
    );
    await expect(result.getByTestId('rule-check-selected')).toContainText(
      'Explains the 1 value in 1 observation. 7 nodes.',
    );
    const candidates = result.getByTestId('rule-check-candidate');
    await expect(candidates).toHaveCount(3);
    await expect(candidates.nth(0)).toContainText('Explains 0 of 1 value');
    await expect(candidates.nth(0)).toContainText('The old app wrote 2.12; this gives 2.13');
    await expect(candidates.nth(1)).toContainText('simplest, chosen');

    // The same answer as the API's, for the same candidates.
    const api = await (
      await page.request.post(`${API}/api/projects/${projectId}/rules/verify`, {
        data: {
          target: 'bill.gst',
          candidates: ['trunc((bill.subtotal - bill.discount) * 0.17, 2)'],
        },
      })
    ).json();
    expect(api.selected.expression).toBe('trunc((bill.subtotal - bill.discount) * 0.17, 2)');

    // The discount: a bill of 12.50 cannot tell "over 5000" from "5000 or more". It asks.
    await target.selectOption('bill.discount');
    await check
      .getByLabel('Candidate rules, one per line (up to 10)')
      .fill(
        [
          'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
          'if bill.subtotal >= 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
        ].join('\n'),
      );
    await check.getByRole('button', { name: run }).click();
    await expect(check.getByTestId('rule-check-candidate').nth(1)).toContainText(
      'also fits, not chosen',
    );
    await expect(check.getByTestId('rule-check-probes')).toContainText(
      'Try a bill subtotal of exactly 5000 and of 5001.',
    );

    await page.request.delete(`${API}/api/projects/${projectId}`);
  });
});
