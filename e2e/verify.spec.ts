// @spec rebirth-certificate#3 The verify page.
// @spec rebirth-certificate#3.2 Prompt 72 done when: /verify shows a real certificate as valid,
// checked in the browser, and a tampered one as not valid. The certificate is a real one: Shifa
// proved on the 1998 app in js-dos. The tampered one is the same file with one digit changed on its
// way to the browser, so the server is not trusted for the answer.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { issueShifaCertificate } from './helpers/certificate';
import { API } from './helpers/raise';

test('a real certificate verifies in the browser, with its paper, QR code and PDF; a tampered one does not', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const { projectId, certId } = await issueShifaCertificate(page);

  // From the Proof tab to the verify page.
  await page.getByTestId('proof-certificate').getByRole('link', { name: 'Verify it' }).click();
  await expect(page).toHaveURL(new RegExp(`/verify/${certId}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Verify a certificate' })).toBeVisible();
  const result = page.getByTestId('verify-result');
  await expect(result).toHaveAttribute('data-valid', 'true', { timeout: 30_000 });
  await expect(result).toContainText('Valid: signed with the Afterlife key');

  // The paper: what was proved, in words.
  const lines = page.getByTestId('certificate-lines');
  await expect(lines).toContainText('Shifa Medical Store (sample app)');
  await expect(lines).toContainText('8 cases');
  await expect(lines).toContainText('0 differences');
  await expect(lines).toContainText('every one matching');
  // The QR code of this page.
  const qr = page.getByTestId('certificate-qr');
  await expect(qr).toHaveAccessibleName('QR code of this page');
  await expect(qr.locator('svg')).toBeVisible();
  // The PDF.
  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download the PDF' }).click(),
  ]);
  expect(pdf.suggestedFilename()).toBe(`rebirth-certificate-${certId}.pdf`);
  const bytes = readFileSync((await pdf.path())!, 'latin1');
  expect(bytes.startsWith('%PDF-1.4')).toBe(true);
  expect(bytes).toContain('Shifa Medical Store');
  expect(bytes).toContain(`/verify/${certId}`);

  // Tampered on its way: one digit of the case count changed. The browser says it is not valid.
  await page.route(`${API}/api/certificates/${certId}`, async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace('"cases":8', '"cases":9');
    await route.fulfill({ response: res, body });
  });
  await page.reload();
  await expect(result).toHaveAttribute('data-valid', 'false', { timeout: 30_000 });
  await expect(result).toContainText('Not valid');
  await expect(result).toContainText('The signature does not match: the certificate was changed');
  await expect(page.getByTestId('certificate-lines')).toHaveCount(0);
  await page.unroute(`${API}/api/certificates/${certId}`);
  await page.request.delete(`${API}/api/projects/${projectId}`);
});

test('an id with no certificate says so', async ({ page }) => {
  await page.goto('/verify/0192b6a0-0000-7000-8000-00000000dead');
  await expect(page.getByTestId('verify-result')).toContainText('No certificate with id');
});
