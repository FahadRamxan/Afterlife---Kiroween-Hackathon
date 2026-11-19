// Review 31-40, finding 4: two tool calls at once must never share the emulator. The server runs
// them one after the other, in the order they came.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FakeEmulator, buildBundle, type KeyStroke } from '@afterlife/emulator';
import { renderScreen, type CellInput } from '@afterlife/screen';
import { describe, expect, it } from 'vitest';
import { createEmulatorServer } from './server';

const blank = () => {
  const cells: CellInput[][] = Array.from({ length: 25 }, () =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: 7, bg: 0 })),
  );
  cells[0]![0]!.code = 'A'.charCodeAt(0);
  return renderScreen({ cellWidth: 8, cellHeight: 16, cells });
};

/** Counts how many sendKeys run at the same moment; each takes 30 ms. */
class SlowEmulator extends FakeEmulator {
  inFlight = 0;
  most = 0;
  order: string[] = [];
  override async sendKeys(keys: string | KeyStroke[]): Promise<void> {
    this.inFlight++;
    this.most = Math.max(this.most, this.inFlight);
    await new Promise((r) => setTimeout(r, 30));
    this.order.push(
      typeof keys === 'string'
        ? keys
        : keys.map((k) => (k.kind === 'text' ? k.text : k.key)).join(''),
    );
    await super.sendKeys(keys);
    this.inFlight--;
  }
}

describe('tool calls at once', () => {
  it('run one at a time, in order, on the one emulator', async () => {
    const emu = new SlowEmulator({ screen: blank() });
    const server = createEmulatorServer({
      apps: {
        shifa: {
          name: 'Shifa Medical Store',
          dosTime: '1998-07-15 10:00:00',
          bundle: async () =>
            buildBundle({ executable: 'A.COM', files: { 'A.COM': new Uint8Array([0xc3]) } }),
        },
      },
      createController: async () => emu,
      record: { stableMs: 5, pollMs: 1 },
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    try {
      await client.callTool({ name: 'boot_app', arguments: { name: 'shifa' } });
      const results = await Promise.all(
        ['1', '2', '3', '4'].map((keys) =>
          client.callTool({ name: 'send_keys', arguments: { keys } }),
        ),
      );
      expect(results.every((r) => !r.isError)).toBe(true);
      expect(emu.most).toBe(1);
      expect(emu.order).toEqual(['1', '2', '3', '4']);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
