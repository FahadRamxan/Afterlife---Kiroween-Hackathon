// Prompt 34: /docs/mcp renders the README's MCP guide.
import { expect, test } from '@playwright/test';

test.describe('/docs/mcp', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/mcp');
  });

  test('renders the guide: heading, install steps and the mcp.json to paste', async ({ page }) => {
    await expect(page).toHaveTitle("Use Afterlife's emulator from your own Kiro · Afterlife");
    await expect(
      page.getByRole('heading', { level: 1, name: "Use Afterlife's emulator from your own Kiro" }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Install' })).toBeVisible();
    const config = page.locator('pre').filter({ hasText: 'afterlife-emulator' });
    await expect(config).toContainText('"command": "node"');
    await expect(config).toContainText('packages/mcp-emulator/src/main.ts');
  });

  test('lists the 8 tools in a table', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table.getByRole('row')).toHaveCount(9); // header + 8 tools
    for (const tool of [
      'list_apps',
      'boot_app',
      'send_keys',
      'read_screen',
      'snapshot_data',
      'diff_data',
      'read_table',
      'reset',
    ])
      await expect(table).toContainText(tool);
  });

  test('shows the GIF of the DOS app driven through MCP, and it loads', async ({ page }) => {
    const gif = page.getByRole('img', { name: /afterlife-emulator MCP tools/ });
    await expect(gif).toBeVisible();
    await expect(gif).toHaveAttribute('src', '/mcp/afterlife-mcp.gif');
    expect(await gif.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(
      640,
    );
  });
});
