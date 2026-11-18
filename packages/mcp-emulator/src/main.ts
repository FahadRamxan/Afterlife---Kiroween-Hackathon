// afterlife-emulator over stdio, for Kiro (.kiro/settings/mcp.json): the Graveyard apps in
// js-dos v8 in headless Chromium, one at a time. Logs go to stderr; stdout is the MCP channel.
import { HeadlessJsDos, HeadlessPool } from '@afterlife/emulator/headless';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { graveyardApps } from './apps';
import { createEmulatorServer } from './server';

const pool = new HeadlessPool({ size: 1, cycles: 20000 });
const server = createEmulatorServer({
  apps: graveyardApps(),
  createController: () => pool.acquire(),
  destroyController: (c) => pool.release(c as HeadlessJsDos),
});

async function main() {
  await server.connect(new StdioServerTransport());
  console.error('afterlife-emulator: ready on stdio');
}

async function stop() {
  await server.close().catch(() => {});
  await pool.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
process.stdin.on('close', () => void stop());

main().catch((e) => {
  console.error('afterlife-emulator:', e);
  process.exit(1);
});
