// @spec learned-certificates#3.3 Prompt 81 done when: Iqra's and Barkat's unfinished actions show
// "not reborn yet". Their recorded runs, made without a model: the Archaeologist did not find how
// the old app works out Iqra's fees or Barkat's balances, so the Surgeon published nothing, and the
// Proof tab says what each action is missing instead of failing 50 of 50 cases.
import { expect, test } from '@playwright/test';
async function raiseRecorded(page: import('@playwright/test').Page, name: string) {
  test.setTimeout(240_000);
  await page.goto('/graveyard');
  await page.getByRole('button', { name: `Watch a recorded run of ${name}` }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByTestId('steps').getByRole('progressbar')).toHaveAccessibleName(
    /^6 of 6 steps run/,
    { timeout: 180_000 },
  );
}
for (const [name, actions, missing] of [
  ['Iqra School Fees', ['Add a payment'], 'payment FEE'],
  ['Barkat Kiryana Ledger', ['Sale on credit', 'Payment received'], 'ledger BALANCE'],
] as const)
  test(`${name}: each unfinished action is "not reborn yet", with what it is missing`, async ({
    page,
  }) => {
    await raiseRecorded(page, name);
    await page.getByRole('tab', { name: 'Proof', exact: true }).click();
    const list = page.getByTestId('proof-not-reborn');
    await expect(list).toContainText('Not reborn yet, so not proved:', { timeout: 30_000 });
    for (const a of actions) await expect(list).toContainText(a);
    await expect(list).toContainText(missing);
    // No case was run, so none differs: the certificate line says why there is none.
    await expect(page.getByTestId('proof-certificate')).toContainText(
      'No action is reborn yet, so there is nothing to prove',
    );
  });
