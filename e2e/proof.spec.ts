// @spec oracle-proof#4 The proof run in the app.
// @spec oracle-proof#4.2 Prompt 70 done when: the Proof tab shows a 50-case proof. A recorded run of
// Shifa: the real Oracle ran 50 cases on the 1998 app in js-dos and on the reborn app, and found
// where the Archaeologist's Soul does not yet do what the old app does (it sells batches the old
// app refuses). The tab shows the two sides, the counter, the log, and the shrunk counterexample.
import { expect, test } from '@playwright/test';
import { API, raiseShifa } from './helpers/raise';

type Proof = {
  numRuns: number;
  passed: number;
  failed: number;
  skipped: number;
  counterexample: { explanation: string; differences: unknown[] } | null;
};

test('the Proof tab: 50 cases, old against new, and the counterexample', async ({ page }) => {
  const id = await raiseShifa(page, { recorded: true });
  const steps = (await (await page.request.get(`${API}/api/projects/${id}/steps`)).json())
    .steps as {
    step: string;
    proof: Proof | null;
  }[];
  const proof = steps.find((s) => s.step === 'prove')!.proof!;
  expect(proof.numRuns).toBe(50);
  expect(proof.passed + proof.failed + proof.skipped).toBe(50);
  // The recorded run found differences: the inferred Soul sells expired and post-1999 batches.
  expect(proof.failed).toBeGreaterThan(0);

  await page.getByRole('tab', { name: 'Proof', exact: true }).click();
  const panel = page.getByTestId('proof-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('proof-counter')).toHaveText(
    `50 / 50 cases · ${proof.failed} ${proof.failed === 1 ? 'difference' : 'differences'}`,
  );
  await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  await expect(panel.getByRole('progressbar')).toHaveAccessibleName('50 of 50 proof cases run');
  await expect(panel.getByTestId('proof-done')).toContainText(
    'did not always do what the old app did',
  );

  // The split screen: the old app's own screen on the left, the reborn app's record on the right.
  await expect(
    panel.getByRole('region', { name: /Shifa Medical Store, the old app, after case \d+/ }),
  ).toBeVisible();
  await expect(panel.getByTestId('proof-old-screen')).toContainText('SHIFA MEDICAL STORE');
  await expect(panel.getByTestId('proof-new-side')).toContainText(/Case \d+/);

  // The log: the newest cases, each the same, different or skipped.
  const log = panel.getByTestId('proof-log').getByRole('listitem');
  await expect(log).toHaveCount(20);

  // The red badge opens the counterexample, shrunk, with both sides.
  const badge = panel.getByRole('button', { name: 'Difference' });
  await expect(badge).toHaveAttribute('aria-expanded', 'false');
  await badge.click();
  await expect(badge).toHaveAttribute('aria-expanded', 'true');
  const cx = panel.getByTestId('counterexample');
  await expect(cx).toContainText(proof.counterexample!.explanation);
  await expect(cx).toContainText('each from a fresh start');
  await expect(cx.getByRole('row')).toHaveCount(proof.counterexample!.differences.length + 1);
  await expect(cx.getByRole('columnheader')).toHaveText([
    'Table',
    'Record',
    'Field',
    'Old app',
    'Reborn app',
  ]);
  await page.request.delete(`${API}/api/projects/${id}`);
});
