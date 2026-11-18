// The server as Kiro starts it: a child process speaking MCP over stdio (src/main.ts).
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

describe('afterlife-emulator over stdio', () => {
  it('starts, lists its tools and boots Shifa', { timeout: 120_000 }, async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', resolve(__dirname, 'main.ts')],
      cwd: resolve(__dirname, '..'),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'stdio-test', version: '1.0.0' });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('boot_app');
      const boot = (await client.callTool({ name: 'boot_app', arguments: { name: 'shifa' } })) as {
        content: { text: string }[];
      };
      expect(boot.content[0]!.text).toContain('MAIN MENU');
    } finally {
      await client.close();
    }
  });
});
