// @spec rebirth-certificate#2 Issue and serve the certificate.
// @spec rebirth-certificate#2.3 Prompt 71 done when: a clean proof issues a certificate anyone can
// check. A live raise of Shifa, given the Soul of the 1998 app as it really runs (its Y2K expiry
// check included); its data migrated for that Soul and proved again on the real app in js-dos. The
// Proof tab says the certificate was issued; the downloaded file verifies with the published key,
// and fails once a byte of it is changed.
import { expect, test, type Page } from '@playwright/test';
import { verifyCertificateText } from '../packages/certificate/src/index';
import { SHIFA_AS_IT_RUNS_SOUL } from '../packages/soul/src/examples/shifa';
import { API, raiseShifaWithSoul } from './helpers/raise';

const stepStatus = (page: Page, step: string) => page.getByTestId(`step-${step}`);

async function runAgain(page: Page, step: string, attempt: number) {
  await page.getByRole('button', { name: `Run ${step} again, alone` }).click();
  await expect(stepStatus(page, step)).toContainText(`attempt ${attempt}`, { timeout: 30_000 });
  await expect(stepStatus(page, step)).toHaveAttribute('data-status', 'done', { timeout: 240_000 });
}

test('a clean proof on the real app issues a Rebirth Certificate that verifies', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const id = await raiseShifaWithSoul(page, SHIFA_AS_IT_RUNS_SOUL);
  // The Soul is new: migrate its data, then prove it (8 cases on the e2e worker).
  await runAgain(page, 'undertake', 2);
  await runAgain(page, 'prove', 2);

  await page.getByRole('tab', { name: 'Proof', exact: true }).click();
  const line = page.getByTestId('proof-certificate');
  await expect(line).toContainText('Rebirth Certificate issued', { timeout: 30_000 });
  await expect(page.getByTestId('proof-counter')).toHaveText('8 / 8 cases · 0 differences');

  const link = line.getByRole('link', { name: 'Download the certificate' });
  const href = (await link.getAttribute('href'))!;
  expect(href).toMatch(/\/api\/certificates\/[0-9a-f-]{36}\?download=1$/);
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(download.suggestedFilename()).toMatch(/^rebirth-certificate-[0-9a-f-]{36}\.json$/);
  const text = (await (await page.request.get(href)).text()).toString();

  // Checked as a third party would: with the key the issuer publishes, not the one in the file.
  const key = await (await page.request.get(`${API}/.well-known/afterlife-key`)).json();
  const v = await verifyCertificateText(text, key.publicKey);
  expect(v.ok).toBe(true);
  if (!v.ok) return;
  expect(v.payload).toMatchObject({
    project: id,
    app: { name: 'Shifa Medical Store', sourceApp: 'shifa' },
    proof: { cases: 8, failed: 0 },
    reconciliation: { matches: true },
    acceptedDivergences: [],
  });
  expect(v.payload.reconciliation.lines.length).toBeGreaterThan(0);
  // One digit of the case count changed: it no longer verifies.
  const forged = text.replace('"cases":8', '"cases":9');
  expect(forged).not.toBe(text);
  expect(await verifyCertificateText(forged, key.publicKey)).toMatchObject({
    ok: false,
    reason: 'bad-signature',
  });
  await page.request.delete(`${API}/api/projects/${id}`);
});
