// Prompt 51: the Possession Theater. Watching a possession run, the counters go up, the screen
// graph fills in, the agent's thoughts appear line by line, and an action that changes data flies
// into a DbfDiffView card. The live run is short in e2e (POSSESS_MAX_ACTIONS=2); the recorded run
// of Shifa replays a whole real possession, so it is the one watched from start to end.
import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:4000';

async function raise(page: Page, button: string) {
  await page.goto('/graveyard');
  await page.getByRole('button', { name: button }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url().split('/').at(-1)!;
}

const count = async (page: Page, id: string) =>
  Number(
    (
      await page
        .getByTestId(id)
        .innerText()
        .catch(() => '0')
    ).match(/^\d+/)?.[0] ?? 0,
  );

test('watching a possession: the counters go up, the graph fills in, data flies into its card', async ({
  page,
}) => {
  // Possession jobs run one at a time, and other tests raise apps too: it may wait its turn.
  test.setTimeout(330_000);
  const id = await raise(page, 'Watch a recorded run of Shifa Medical Store');
  const panel = page.getByTestId('live-panel');
  await expect(panel.getByTestId('stat-actions')).toBeVisible({ timeout: 180_000 });
  const firstActions = await count(page, 'stat-actions');
  const firstScreens = await count(page, 'stat-screens');
  // The counters go up as the run goes on.
  await expect
    .poll(() => count(page, 'stat-actions'), { timeout: 60_000 })
    .toBeGreaterThan(firstActions + 5);
  await expect
    .poll(() => count(page, 'stat-screens'), { timeout: 60_000 })
    .toBeGreaterThan(firstScreens);
  // The screen graph: a node per screen found (its states grouped under it), the current one lit.
  // Two screens (MAIN MENU, NEW BILL) while the bill is still being made: the thoughts below show
  // only the newest steps.
  const graph = panel.getByTestId('screen-graph');
  await expect
    .poll(async () => Number(await graph.getAttribute('data-nodes')), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(2);
  await expect(graph.locator('[data-testid="graph-node"][data-current="true"]')).toHaveCount(1);
  await expect(graph.locator('.react-flow__node').first()).toBeVisible();
  // What the agent is doing, one plain line at a time.
  await expect(panel.getByTestId('thoughts')).toContainText(
    /Opening "New Bill" from MAIN MENU\.|Typing .* into .* on NEW BILL\./,
  );
  // A bill saved: the data change card, with the records that changed in DbfDiffView.
  const card = panel.getByTestId('data-change');
  await expect(card).toContainText('BILLS.DBF', { timeout: 90_000 });
  await expect(card.getByRole('grid', { name: /BILLS\.DBF/ })).toBeVisible();
  await expect(card.getByText('inserted').first()).toBeVisible();
  // Review of 51-60, finding 6 (checked last: the thoughts above show only the newest
  // steps): states of one screen (a bill with a line typed) are one node, and
  // the counter says screens and states apart.
  await expect(
    graph.locator('[data-testid="graph-node"]').filter({ hasText: /^NEW BILL · \d+ states$/ }),
  ).toHaveCount(1, { timeout: 60_000 });
  await expect
    .poll(async () => Number(await graph.getAttribute('data-nodes')), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(4);
  await expect(panel.getByTestId('stat-screens')).toHaveText(/^\d+ screens found \(\d+ states\)$/);
  await page.request.delete(`${API}/api/projects/${id}`);
});

test('a live possession on the real Shifa shows the theater as it runs', async ({ page }) => {
  // One emulator for all the e2e tests that raise an app: possession may wait its turn.
  test.setTimeout(210_000);
  const id = await raise(page, 'Raise Shifa Medical Store');
  const panel = page.getByTestId('live-panel');
  await expect(panel.getByTestId('stat-actions')).toHaveText('2 actions tried', {
    timeout: 180_000,
  });
  await expect(panel.getByTestId('screen-graph')).toHaveAttribute('data-nodes', /[2-9]/);
  await expect(panel.getByTestId('thoughts').getByRole('listitem')).toHaveCount(2);
  await expect(panel.getByTestId('thoughts')).toContainText('Opening "New Bill" from MAIN MENU.');
  await page.request.delete(`${API}/api/projects/${id}`);
});
