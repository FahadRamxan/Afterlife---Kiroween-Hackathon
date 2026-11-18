// Prompt 32: the MCP tools on the real Shifa EXE, in js-dos v8 in headless Chromium.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { HeadlessPool, type HeadlessJsDos } from '@afterlife/emulator/headless';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { graveyardApps } from './apps';
import { createEmulatorServer } from './server';

vi.setConfig({ testTimeout: 120_000 });

const pool = new HeadlessPool({ size: 1, cycles: 60000, keyDelayMs: 50 });
const server = createEmulatorServer({
  apps: graveyardApps(),
  createController: () => pool.acquire(),
  destroyController: (c) => pool.release(c as HeadlessJsDos),
});
const client = new Client({ name: 'integration', version: '1.0.0' });
const ready = (async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
})();
afterAll(async () => {
  await client.close();
  await server.close();
  await pool.close();
});

type Out = {
  isError?: boolean;
  content: { text: string }[];
  structuredContent?: Record<string, unknown>;
};
/** A value inside a tool's structured result, by path (keys may contain dots, as in "BILLS.DBF"). */
function at(
  r: { structuredContent?: Record<string, unknown> },
  ...path: (string | number)[]
): unknown {
  let v: unknown = r.structuredContent;
  for (const k of path) v = (v as Record<string | number, unknown> | undefined)?.[k];
  return v;
}

const call = async (name: string, args: Record<string, unknown> = {}) => {
  await ready;
  return (await client.callTool({ name, arguments: args })) as Out;
};

describe('afterlife-emulator on the real Shifa', () => {
  it('lists the three Graveyard apps', async () => {
    expect(at(await call('list_apps'), 'apps')).toMatchObject([
      { id: 'barkat' },
      { id: 'iqra' },
      { id: 'shifa' },
    ]);
  });

  it('boots Shifa, opens Stock, and sells a strip of Panadol: the diff shows the bill', async () => {
    const boot = await call('boot_app', { name: 'shifa' });
    expect(at(boot, 'screen', 'title')).toBe('MAIN MENU');
    expect(boot.content[0]!.text).toContain('15/07/98');

    const stock = await call('send_keys', { keys: '2' });
    expect(at(stock, 'screen', 'title')).toBe('STOCK');
    expect(stock.content[0]!.text).toContain('PAN500 PANADOL 500MG STRIP');
    await call('send_keys', { keys: '{Esc}' });

    expect(at(await call('snapshot_data'), 'tables')).toContainEqual({
      file: 'BILLS.DBF',
      records: 3,
    });
    for (const keys of ['1', '{Enter}', 'PAN500{Enter}1{Enter}', '{Enter}'])
      expect((await call('send_keys', { keys })).isError).toBeFalsy();
    const saved = await call('send_keys', { keys: '{F2}' });
    expect(saved.content[0]!.text).toContain('BILL 9807-0001 SAVED');
    expect(at(saved, 'changedTables')).toEqual(['BILLITEM.DBF', 'BILLS.DBF', 'MEDICINE.DBF']);

    const diff = await call('diff_data');
    expect(at(diff, 'tables', 'BILLS.DBF', 'inserted', 0, 'values')).toMatchObject({
      BILL_NO: '9807-0001',
      SUBTOTAL: '12.50',
      GST: '2.12',
      TOTAL: '14.62',
    });
    expect(diff.content[0]!.text).toContain('MEDICINE.DBF: 0 inserted, 0 deleted, 1 changed');

    const screen = await call('read_screen');
    expect(at(screen, 'model', 'title', 'name')).toBe('NEW BILL');

    const table = await call('read_table', { file: 'BILLS.DBF' });
    expect(at(table, 'recordCount')).toBe(4);
  });

  it('reset puts the data back as it was', async () => {
    await call('reset');
    expect(at(await call('read_table', { file: 'BILLS.DBF' }), 'recordCount')).toBe(3);
  });
});
