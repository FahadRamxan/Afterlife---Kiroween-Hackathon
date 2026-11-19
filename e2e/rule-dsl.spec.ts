// Prompt 42: the rule expression language, tried on the Playground.
import { expect, test } from '@playwright/test';

test.describe('rule tryout', () => {
  test("works out Shifa's discount rule exactly, and says what is wrong when it cannot", async ({
    page,
  }) => {
    await page.goto('/playground');
    const card = page.getByTestId('rule-tryout');
    // Typing before the page is hydrated would be overwritten (seen in dev mode under load).
    await expect(card).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    await expect(card.getByTestId('rule-value')).toHaveText('600');

    const rule = card.getByLabel('Rule');
    const values = card.getByLabel(/^Values/);
    await values.fill('{"bill": {"subtotal": "5000"}}');
    await expect(card.getByTestId('rule-value')).toHaveText('0');

    // Exact decimals: 0.1 + 0.2 is 0.3, not 0.30000000000000004.
    await rule.fill('0.1 + 0.2');
    await expect(card.getByTestId('rule-value')).toHaveText('0.3');

    await rule.fill('trunc(102.37 * 0.17, 2)');
    await expect(card.getByTestId('rule-value')).toHaveText('17.4');

    await rule.fill('bill.subtotal >');
    await expect(card.getByRole('alert')).toContainText(
      'The rule cannot be read: The expression ends too early',
    );
    await rule.fill('bill.constructor');
    await expect(card.getByRole('alert')).toContainText('bill has no field constructor');
  });
});
