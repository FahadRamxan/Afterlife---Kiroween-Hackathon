// Raising Shifa and giving it a Soul, for the tests of what comes after the Soul. The pipeline's
// archaeology step stores a Soul version of its own: the tests wait for the pipeline to finish
// first, so the Soul they post is the newest one (else the step's Soul could land after it).
import { expect, test, type Page } from '@playwright/test';
import { SHIFA_REFERENCE_SOUL } from '../../packages/soul/src/examples/shifa';

export const API = 'http://localhost:4000';

/** Raises Shifa from the Graveyard and waits until the six steps have run. Gives its id. */
export async function raiseShifa(page: Page): Promise<string> {
  // The six steps run for real (possession boots Shifa in js-dos): give the test the time.
  test.setTimeout(Math.max(test.info().timeout, 240_000));
  await page.goto('/graveyard');
  await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const id = page.url().split('/').at(-1)!;
  await expect(page.getByTestId('steps').getByRole('progressbar')).toHaveAccessibleName(
    /^6 of 6 steps run/,
    { timeout: 180_000 },
  );
  return id;
}

/** Raises Shifa, then stores a Soul for it (the reference Soul by default) as its newest version. */
export async function raiseShifaWithSoul(page: Page, soul: unknown = SHIFA_REFERENCE_SOUL) {
  const id = await raiseShifa(page);
  const res = await page.request.post(`${API}/api/projects/${id}/souls`, { data: soul });
  expect(res.status()).toBe(201);
  return id;
}
