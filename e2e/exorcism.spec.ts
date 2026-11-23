// @spec exorcist#3 The Exorcism tab.
// @spec exorcist#3.2 Prompt 75 done when: an e2e test fixes one finding, keeps one, and sees the
// certificate updated. A recorded run of Shifa: the Exorcist found its two-digit-year expiry check
// and its negative stock. Fixing the first writes a new Soul version and proves it again on the real
// 1998 app (the e2e worker's 8 cases); the certificate is issued with the fix as an accepted
// divergence.
import { expect, test } from '@playwright/test';
import { verifyCertificateText } from '../packages/certificate/src/index';
import { API, raiseShifa } from './helpers/raise';

test('fix one ghost, keep the other, and the certificate lists the fix', async ({ page }) => {
  test.setTimeout(600_000);
  const id = await raiseShifa(page, { recorded: true });
  await page.getByRole('tab', { name: 'Exorcism', exact: true }).click();
  const tab = page.getByTestId('exorcism');
  await expect(tab.getByTestId('ghosts-left')).toHaveText('2 ghosts left', { timeout: 30_000 });
  const ghost = (code: string) => tab.locator(`[data-testid="ghost-card"][data-code="${code}"]`);
  const y2k = ghost('two-digit-year:medicine.expiry');
  const stock = ghost('negative-allowed:medicine.qty');

  // A ghost card: title, severity, since when, English and Urdu, and the evidence replay.
  await expect(y2k).toContainText('Medicine expiry is compared with two-digit years');
  await expect(y2k.getByTestId('ghost-severity')).toHaveText('high');
  await expect(y2k.getByTestId('ghost-since')).toHaveText('since 1998');
  await expect(y2k.locator('p[lang="ur"]').first()).toHaveAttribute('dir', 'rtl');
  await y2k.getByTestId('ghost-evidence').locator('summary').click();
  await expect(y2k.getByTestId('evidence-screen').first()).toContainText('EXPIRED');
  await expect(y2k).toContainText('EXPIRY is compared with four-digit years');

  // Fix: the ghost dissolves, one is left, and the reborn app is proved again.
  await y2k.getByRole('button', { name: 'Fix', exact: true }).click();
  await expect(y2k).toHaveCount(0);
  await expect(tab.getByTestId('ghosts-left')).toHaveText('1 ghost left');
  await expect(tab.getByTestId('exorcism-notice')).toContainText('Proving the reborn app again');
  // Keep: the last ghost goes too; nothing to prove again (the Vessel already copies it).
  await stock.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(tab.getByTestId('ghosts-left')).toHaveText('No ghosts left');
  await expect(tab.locator('[data-testid="settled-card"][data-decision="fix"]')).toContainText(
    'Exorcised:',
  );
  await expect(tab.locator('[data-testid="settled-card"][data-decision="keep"]')).toContainText(
    'Kept:',
  );

  // The certificate, once the proof of the fixed Soul is done: issued, with the fix listed.
  await page.getByRole('tab', { name: 'Proof', exact: true }).click();
  const line = page.getByTestId('proof-certificate');
  await expect(line).toContainText('Rebirth Certificate issued', { timeout: 300_000 });
  await expect(page.getByTestId('proof-divergences')).toContainText(
    'EXPIRY is compared with four-digit years',
  );
  const href = (await line
    .getByRole('link', { name: 'Download the certificate' })
    .getAttribute('href'))!;
  const key = await (await page.request.get(`${API}/.well-known/afterlife-key`)).json();
  const v = await verifyCertificateText(await (await page.request.get(href)).text(), key.publicKey);
  expect(v.ok).toBe(true);
  if (!v.ok) return;
  expect(v.payload.soul.version).toBe(2);
  expect(v.payload.proof.failed).toBe(0);
  expect(v.payload.acceptedDivergences).toEqual([
    { id: 'two-digit-year:medicine.expiry', text: 'EXPIRY is compared with four-digit years' },
  ]);
  await page.request.delete(`${API}/api/projects/${id}`);
});
