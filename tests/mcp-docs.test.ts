// Prompt 34: the README's MCP tool list is the server's real tool list (no drift).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEmulatorServer } from '@afterlife/mcp-emulator';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { MCP_SECTION, readmeSection } from '../apps/web/lib/readme';

describe("README: Use Afterlife's emulator from your own Kiro", () => {
  const section = readmeSection(
    readFileSync(resolve(__dirname, '../README.md'), 'utf8'),
    MCP_SECTION,
  )!;

  it('lists exactly the tools the server registers', async () => {
    const server = createEmulatorServer({
      apps: {},
      createController: async () => {
        throw new Error('not used');
      },
    });
    const client = new Client({ name: 'docs-test', version: '1.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const { tools } = await client.listTools();
    await client.close();
    const documented = [...section.matchAll(/^\| `([a-z_]+)`\s+\|/gm)].map((m) => m[1]);
    expect(documented.sort()).toEqual(tools.map((t) => t.name).sort());
  });

  it('shows the same mcp.json as the repo uses, with node and not pnpm', () => {
    expect(section).toContain('"command": "node"');
    expect(section).toContain('"args": ["--import", "tsx", "packages/mcp-emulator/src/main.ts"]');
  });

  it('the GIF it shows exists', () => {
    const gif = readFileSync(resolve(__dirname, '../apps/web/public/mcp/afterlife-mcp.gif'));
    expect(gif.subarray(0, 6).toString('latin1')).toBe('GIF89a');
  });
});
