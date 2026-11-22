// A Rebirth Certificate for the tests of what comes after it (Prompts 71 and 72): a live raise of
// Shifa, given the Soul of the 1998 app as it really runs, its data migrated for that Soul and
// proved again on the real app in js-dos (8 cases on the e2e worker). Gives the project and
// certificate ids.
import { expect, type Page } from '@playwright/test';
import { SHIFA_AS_IT_RUNS_SOUL } from '../../packages/soul/src/examples/shifa';
import { raiseShifaWithSoul } from './raise';

async function runAgain(page: Page, step: string, attempt: number) {
  const row = page.getByTestId(`step-${step}`);
  await page.getByRole('button', { name: `Run ${step} again, alone` }).click();
  await expect(row).toContainText(`attempt ${attempt}`, { timeout: 30_000 });
  await expect(row).toHaveAttribute('data-status', 'done', { timeout: 240_000 });
}

export async function issueShifaCertificate(page: Page) {
  const projectId = await raiseShifaWithSoul(page, SHIFA_AS_IT_RUNS_SOUL);
  await runAgain(page, 'undertake', 2);
  await runAgain(page, 'prove', 2);
  await page.getByRole('tab', { name: 'Proof', exact: true }).click();
  const line = page.getByTestId('proof-certificate');
  await expect(line).toContainText('Rebirth Certificate issued', { timeout: 30_000 });
  const href = (await line
    .getByRole('link', { name: 'Download the certificate' })
    .getAttribute('href'))!;
  const certId = /\/api\/certificates\/([0-9a-f-]{36})/.exec(href)![1]!;
  return { projectId, certId, href };
}
