// Prompt 38 "done when": the Raise page receives screen events from a real headless run. Raise
// queues possession; the worker boots the real Shifa EXE in headless js-dos and sends its first
// screen; the API streams it over the WebSocket; the page draws it.
import { expect, test } from '@playwright/test';

const API = 'http://localhost:4000';

test.describe('live progress', () => {
  test('the Raise page shows the screen the worker reads from a real headless run', async ({
    page,
  }) => {
    // The worker runs one emulator at a time, and other tests raise apps too.
    test.setTimeout(120_000);
    await page.goto('/graveyard');
    await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
    await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const id = page.url().split('/').at(-1)!;

    await expect(page.getByTestId('live-status')).toHaveAttribute('data-status', 'open', {
      timeout: 15_000,
    });
    const screen = page.getByTestId('live-screen');
    await expect(screen).toContainText('SHIFA MEDICAL STORE', { timeout: 90_000 });
    await expect(screen).toContainText('MAIN MENU');
    // The step log says what happened, honestly: booted, and exploration not built yet.
    const log = page.getByTestId('live-log');
    await expect(log).toContainText('Booting Shifa Medical Store in headless js-dos');
    await expect(log).toContainText('possess: skipped (Exploration is not built yet (Prompt 48)', {
      timeout: 30_000,
    });

    // Reloading replays the events: the screen is back without a new run.
    await page.reload();
    await expect(page.getByTestId('live-screen')).toContainText('MAIN MENU', { timeout: 15_000 });

    await page.request.delete(`${API}/api/projects/${id}`);
  });

  test('when the API drops the connection the page says so and reconnects', async ({ page }) => {
    // The first socket goes to the real API, then "the API restarts" (close 1012) after 2 s.
    // (In dev mode React mounts twice, so the first socket may already be closed: drop the newest.)
    const sockets: { close(o: { code: number; reason: string }): Promise<void> }[] = [];
    const urls: string[] = [];
    let dropped = false;
    await page.routeWebSocket(/\/api\/projects\/[^/]+\/live/, (ws) => {
      urls.push(ws.url());
      sockets.push(ws);
      ws.connectToServer();
      if (sockets.length === 1)
        setTimeout(() => {
          dropped = true;
          void sockets.at(-1)!.close({ code: 1012, reason: 'restarting' });
        }, 2000);
    });
    await page.goto('/graveyard');
    await page.getByRole('button', { name: 'Raise Iqra School Fees' }).click();
    await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const id = page.url().split('/').at(-1)!;
    const status = page.getByTestId('live-status');
    await expect(status).toHaveAttribute('data-status', 'open', { timeout: 15_000 });
    await expect(status).toHaveAttribute('data-status', 'reconnecting', { timeout: 10_000 });
    await expect(status).toHaveText('Connection lost, reconnecting…');
    await expect(status).toHaveAttribute('data-status', 'open', { timeout: 15_000 });
    expect(dropped).toBe(true);
    expect(urls.length).toBeGreaterThanOrEqual(2);
    await page.request.delete(`${API}/api/projects/${id}`);
  });
});
