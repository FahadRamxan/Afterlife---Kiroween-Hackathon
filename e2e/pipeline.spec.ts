// Prompt 39: the pipeline on the Raise page. A live raise runs all six steps (the ones whose agent
// is not built yet say so); one step can be run again alone; a recorded run replays a real run and
// is labelled as one.
import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:4000';
const STEPS = ['possess', 'archaeology', 'rebirth', 'undertake', 'prove', 'exorcise'];

async function raise(page: Page, button: string) {
  await page.goto('/graveyard');
  await page.getByRole('button', { name: button }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url().split('/').at(-1)!;
}

test.describe('pipeline', () => {
  test('a live raise runs the six steps in order: possess explores, the rest say why they did nothing', async ({
    page,
  }) => {
    // Archaeology types its probe bills into the real old app too (review of 51-60, finding 3).
    test.setTimeout(240_000);
    const id = await raise(page, 'Raise Shifa Medical Store');
    const steps = page.getByTestId('steps');
    // A short possession (2 actions in the e2e worker) saves nothing, so the Soul has no actions
    // and the Surgeon has no app to publish yet: rebirth is skipped and says so. The Undertaker
    // still moves the old app's data (Prompt 64).
    await expect(steps.getByRole('progressbar')).toHaveAccessibleName(
      '6 of 6 steps run, 3 of them skipped',
      { timeout: 180_000 },
    );
    // Possession explores (Prompt 48); archaeology finds the entities (Prompt 53).
    await expect(page.getByTestId('step-possess')).toHaveAttribute('data-status', 'done');
    await expect(page.getByTestId('step-archaeology')).toHaveAttribute('data-status', 'done');
    await expect(page.getByTestId('step-rebirth')).toHaveAttribute('data-status', 'skipped');
    await expect(page.getByTestId('step-rebirth')).toContainText(
      'The Soul has no actions yet, so there is no app to publish',
    );
    await expect(page.getByTestId('step-undertake')).toHaveAttribute('data-status', 'done');
    for (const s of STEPS.slice(4))
      await expect(page.getByTestId(`step-${s}`)).toHaveAttribute('data-status', 'skipped');
    await expect(page.getByTestId('step-prove')).toContainText(
      'The Soul has no actions to prove yet',
    );
    await expect(page.getByTestId('run-mode')).toHaveCount(0);

    // Run one step again, alone: it runs a second time, and nothing after it runs again.
    await page.getByRole('button', { name: 'Run rebirth again, alone' }).click();
    await expect(page.getByTestId('step-rebirth')).toContainText('attempt 2', { timeout: 30_000 });
    const after = (await (await page.request.get(`${API}/api/projects/${id}/steps`)).json())
      .steps as {
      step: string;
      attempts: number;
    }[];
    expect(after.map((s) => s.attempts)).toEqual([1, 1, 2, 1, 1, 1]);
    await page.request.delete(`${API}/api/projects/${id}`);
  });

  test('a recorded run is labelled, replays the real first screen, and every step says recorded', async ({
    page,
  }) => {
    // The replay is paced like the real run (about 55 s for Shifa's possession and archaeology).
    test.setTimeout(240_000);
    const id = await raise(page, 'Watch a recorded run of Shifa Medical Store');
    await expect(page.getByTestId('run-mode')).toContainText('Recorded run');
    await expect(page.getByTestId('live-screen')).toContainText('SHIFA MEDICAL STORE', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('live-log')).toContainText('Recorded run from');
    // The recorded possession replays its steps, and the counters follow them.
    await expect(page.getByTestId('stat-actions')).toContainText('actions tried', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('steps').getByRole('progressbar')).toHaveAccessibleName(
      // Only exorcise is left to build (Prompt 73): the recorded run proves the Soul (Prompt 70).
      '6 of 6 steps run, 1 of them skipped',
      { timeout: 150_000 },
    );
    await expect(page.getByTestId('step-archaeology')).toContainText('Recorded run:');
    // Prompt 49: the boundary values the Possessor tried, and what the old app refused.
    const refused = page.getByTestId('possession-refused');
    await expect(refused).toContainText('MEDICINE NOT FOUND ← Code = ZZZ999 (new-key)');
    await expect(page.getByTestId('possession-stats')).toContainText('What the app refused');
    await page.request.delete(`${API}/api/projects/${id}`);
  });
});
