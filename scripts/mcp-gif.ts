/// <reference lib="dom" />
// pnpm mcp:gif (Prompt 34). Drives the real Shifa EXE through the afterlife-emulator MCP tools
// (in-process, a real MCP client and server) and saves the emulator's screen after each tool call
// as apps/web/public/mcp/afterlife-mcp.gif. The GIF is in the 16 DOS colours, so no colour is
// approximated. Prints the tool calls, which the README lists under the GIF.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { HeadlessPool, type HeadlessJsDos } from '@afterlife/emulator/headless';
import { VGA_PALETTE } from '@afterlife/screen';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { GIFEncoder } from 'gifenc';
import { graveyardApps } from '../packages/mcp-emulator/src/apps';
import { createEmulatorServer } from '../packages/mcp-emulator/src/server';

const OUT = resolve(__dirname, '../apps/web/public/mcp/afterlife-mcp.gif');
const CALLS: [string, Record<string, unknown>][] = [
  ['boot_app', { name: 'shifa' }],
  ['send_keys', { keys: '2' }],
  ['send_keys', { keys: '{PgDn}' }],
  ['send_keys', { keys: '{Esc}' }],
  ['snapshot_data', {}],
  ['send_keys', { keys: '1' }],
  ['send_keys', { keys: '{Enter}' }],
  ['send_keys', { keys: 'PAN500{Enter}2{Enter}' }],
  ['send_keys', { keys: 'BRU400{Enter}1{Enter}' }],
  ['send_keys', { keys: '{Enter}' }],
  ['send_keys', { keys: '{F2}' }],
  ['diff_data', {}],
];

async function main() {
  const pool = new HeadlessPool({ size: 1, cycles: 20000 });
  let emu: HeadlessJsDos | null = null;
  const server = createEmulatorServer({
    apps: graveyardApps(),
    createController: async () => (emu = await pool.acquire()),
    destroyController: (c) => pool.release(c as HeadlessJsDos),
  });
  const client = new Client({ name: 'mcp-gif', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);

  const gif = GIFEncoder();
  const palette = VGA_PALETTE.map(([r, g, bl]) => [r, g, bl]);
  const index = new Map(VGA_PALETTE.map(([r, g, bl], i) => [(r << 16) | (g << 8) | bl, i]));
  let size: { w: number; h: number } | null = null;
  try {
    for (const [name, args] of CALLS) {
      const r = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean;
        content: { text: string }[];
      };
      if (r.isError) throw new Error(`${name} failed: ${r.content[0]?.text}`);
      const first = r.content[0]!.text.split('\n')[0];
      console.log(`${name}(${JSON.stringify(args)}) -> ${first}`);
      const shot = await emu!.screenshot();
      size ??= { w: shot.width, h: shot.height };
      const px = new Uint8Array(shot.width * shot.height);
      for (let i = 0; i < px.length; i++) {
        const k = (shot.rgba[i * 4]! << 16) | (shot.rgba[i * 4 + 1]! << 8) | shot.rgba[i * 4 + 2]!;
        const c = index.get(k);
        if (c === undefined) throw new Error(`Pixel ${i} is not a DOS colour: #${k.toString(16)}`);
        px[i] = c;
      }
      const last = name === CALLS.at(-1)![0];
      gif.writeFrame(px, shot.width, shot.height, { palette, delay: last ? 3000 : 1300 });
    }
  } finally {
    await client.close();
    await server.close();
    await pool.close();
  }
  gif.finish();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, gif.bytes());
  console.log(
    `wrote ${OUT} (${size!.w}x${size!.h}, ${CALLS.length} frames, ${gif.bytes().length} bytes)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
