import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { writeDbf, type DbfRecord } from '@afterlife/dbf';
import { FakeEmulator, buildBundle } from '@afterlife/emulator';
import { renderScreen, type CellInput } from '@afterlife/screen';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmulatorServer, type AppSource } from './server';

/** A blue DOS screen with `title` in a cyan bar and body lines. */
function screen(title: string, lines: string[] = []) {
  const cells: CellInput[][] = Array.from({ length: 25 }, (_, r) =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: 15, bg: r === 0 ? 3 : 1 })),
  );
  const put = (r: number, c: number, s: string) =>
    [...s].forEach((ch, k) => (cells[r]![c + k]!.code = ch.charCodeAt(0)));
  put(0, 1, 'SHIFA MEDICAL STORE');
  put(0, 36, title);
  lines.forEach((l, i) => put(3 + i, 1, l));
  return renderScreen({ cellWidth: 8, cellHeight: 16, cells });
}

const bills = (n: number) =>
  writeDbf({
    fields: [
      { name: 'BILL_NO', type: 'C', length: 9, decimals: 0 },
      { name: 'TOTAL', type: 'N', length: 11, decimals: 2 },
    ],
    records: Array.from({ length: n }, (_, i): DbfRecord => ({
      deleted: false,
      values: { BILL_NO: `9807-000${i + 1}`, TOTAL: '102.37' },
    })),
  });

const SHIFA_EXE = new Uint8Array(
  readFileSync(resolve(__dirname, '../../../samples/graveyard/dist/shifa/SHIFA.EXE')),
);
const shifa: AppSource = {
  name: 'Shifa Medical Store',
  dosTime: '1998-07-15 10:00:00',
  bundle: async () =>
    buildBundle({
      executable: 'SHIFA.EXE',
      files: { 'SHIFA.EXE': SHIFA_EXE, 'BILLS.DBF': bills(3) },
    }),
};

/** The fake old app: 2 opens STOCK, F2 saves a bill. */
const fakeShifa = () =>
  new FakeEmulator({
    screen: screen('MAIN MENU', ['1  New Bill', '2  Stock']),
    onKeys: (keys, app) => {
      const text = keys.map((k) => (k.kind === 'text' ? k.text : `{${k.key}}`)).join('');
      if (text === '2') app.setScreen(screen('STOCK', ['PAN500 PANADOL 500MG STRIP']));
      if (text === '{F2}') {
        app.files.set('BILLS.DBF', bills(4));
        app.setScreen(screen('NEW BILL', ['BILL 9807-0004 SAVED']));
      }
    },
  });

let closers: (() => Promise<void>)[] = [];
/** A value inside a tool's structured result, by path (keys may contain dots, as in "BILLS.DBF"). */
function at(
  r: { structuredContent?: Record<string, unknown> },
  ...path: (string | number)[]
): unknown {
  let v: unknown = r.structuredContent;
  for (const k of path) v = (v as Record<string | number, unknown> | undefined)?.[k];
  return v;
}

afterEach(async () => {
  for (const c of closers) await c();
  closers = [];
});

async function connect(made: FakeEmulator[] = []) {
  const server = createEmulatorServer({
    apps: { shifa },
    createController: async () => {
      const f = fakeShifa();
      made.push(f);
      return f;
    },
    record: { stableMs: 10, pollMs: 2 },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  closers.push(
    () => client.close(),
    () => server.close(),
  );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    return r as {
      isError?: boolean;
      content: { type: string; text: string }[];
      structuredContent?: Record<string, unknown>;
    };
  };
  return { client, call };
}

describe('afterlife-emulator MCP server', () => {
  it('lists the tools from the prompt, each with a description', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'boot_app',
        'diff_data',
        'list_apps',
        'read_screen',
        'read_table',
        'reset',
        'send_keys',
        'snapshot_data',
      ].sort(),
    );
    for (const t of tools) expect(t.description, t.name).toBeTruthy();
  });

  it('list_apps names the apps boot_app takes', async () => {
    const { call } = await connect();
    expect((await call('list_apps')).structuredContent).toEqual({
      apps: [{ id: 'shifa', name: 'Shifa Medical Store', dosTime: '1998-07-15 10:00:00' }],
    });
  });

  it('boot_app starts the app at its DOS clock and returns the first screen', async () => {
    const made: FakeEmulator[] = [];
    const { call } = await connect(made);
    const r = await call('boot_app', { name: 'shifa' });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ app: 'shifa', screen: { title: 'MAIN MENU' } });
    expect(made[0]!.dosTime).toBe('1998-07-15 10:00:00');
    expect(r.content[0]!.text).toContain('MAIN MENU');
  });

  it('send_keys presses keys and returns the screen they lead to', async () => {
    const { call } = await connect();
    await call('boot_app', { name: 'shifa' });
    const r = await call('send_keys', { keys: '2' });
    expect(r.structuredContent).toMatchObject({
      keys: '2',
      screen: { title: 'STOCK' },
      changedTables: [],
    });
    expect(r.content[0]!.text).toContain('PAN500 PANADOL 500MG STRIP');
  });

  it('read_screen returns the decoded text and the ScreenModel', async () => {
    const { call } = await connect();
    await call('boot_app', { name: 'shifa' });
    const r = await call('read_screen');
    expect(at(r, 'text')).toHaveLength(25);
    expect(at(r, 'model', 'title', 'name')).toBe('MAIN MENU');
    expect(at(r, 'fingerprint')).toMatch(/^fp_[0-9a-f]{16}$/);
  });

  it('snapshot_data then diff_data shows what the keys changed', async () => {
    const { call } = await connect();
    await call('boot_app', { name: 'shifa' });
    const snap = await call('snapshot_data');
    expect(at(snap, 'tables')).toEqual([{ file: 'BILLS.DBF', records: 3 }]);
    await call('send_keys', { keys: '{F2}' });
    const d = await call('diff_data');
    expect(d.structuredContent).toMatchObject({
      tables: { 'BILLS.DBF': { inserted: [{ values: { BILL_NO: '9807-0004' } }] } },
    });
    expect(d.content[0]!.text).toContain('BILLS.DBF: 1 inserted');
  });

  it('read_table returns the fields and the first rows', async () => {
    const { call } = await connect();
    await call('boot_app', { name: 'shifa' });
    const r = await call('read_table', { file: 'bills.dbf', limit: 2 });
    expect(r.structuredContent).toMatchObject({ file: 'BILLS.DBF', recordCount: 3, moreRows: 1 });
    expect(r.structuredContent).toMatchObject({ fields: [{ name: 'BILL_NO' }, { name: 'TOTAL' }] });
    expect(at(r, 'rows')).toHaveLength(2);
  });

  it('reset boots the app again from its bundle and forgets the snapshot', async () => {
    const made: FakeEmulator[] = [];
    const { call } = await connect(made);
    await call('boot_app', { name: 'shifa' });
    await call('snapshot_data');
    await call('send_keys', { keys: '{F2}' });
    const r = await call('reset');
    expect(r.structuredContent).toMatchObject({ app: 'shifa', screen: { title: 'MAIN MENU' } });
    expect(at(await call('read_table', { file: 'BILLS.DBF' }), 'recordCount')).toBe(3);
    expect((await call('diff_data')).isError).toBe(true);
  });

  it.each([
    ['send_keys before boot_app', 'send_keys', { keys: '2' }, /boot_app first/],
    ['read_screen before boot_app', 'read_screen', {}, /boot_app first/],
    ['an unknown app', 'boot_app', { name: 'nope' }, /Unknown app "nope".*shifa/],
    ['diff_data without a snapshot', 'diff_data', {}, /snapshot_data first/],
  ])('%s is an error result that says what to do', async (_label, tool, args, message) => {
    const { call } = await connect();
    if (tool === 'diff_data') await call('boot_app', { name: 'shifa' });
    const r = await call(tool, args);
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(message);
  });

  it('bad keys and a missing file are error results too', async () => {
    const { call } = await connect();
    await call('boot_app', { name: 'shifa' });
    expect((await call('send_keys', { keys: '{Nope}' })).content[0]!.text).toMatch(
      /unknown key "Nope"/,
    );
    expect((await call('read_table', { file: 'NOPE.DBF' })).content[0]!.text).toMatch(
      /No file NOPE.DBF/,
    );
    expect((await call('read_table', { file: '../x.dbf' })).isError).toBe(true);
  });

  it('booting another app stops the one before', async () => {
    const made: FakeEmulator[] = [];
    const { call } = await connect(made);
    await call('boot_app', { name: 'shifa' });
    await call('boot_app', { name: 'shifa' });
    expect(made).toHaveLength(2);
    await expect(made[0]!.screenshot()).rejects.toMatchObject({ code: 'NOT_BOOTED' });
  });
});

describe('a boot that fails (found in the Prompts 31 to 40 review)', () => {
  it('gives its emulator back, so a pool of one can still boot the next app', async () => {
    // main.ts runs one emulator at a time (a pool of size 1). A boot that failed kept its
    // emulator, and the next boot_app waited for it for ever.
    let live = 0;
    const broken: AppSource = {
      name: 'Broken',
      dosTime: '1998-07-15 10:00:00',
      bundle: async () => new Uint8Array([1, 2, 3]),
    };
    const server = createEmulatorServer({
      apps: { broken, shifa },
      createController: async () => {
        live++;
        return fakeShifa();
      },
      destroyController: async (c) => {
        live--;
        await c.exit();
      },
      record: { stableMs: 10, pollMs: 2 },
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    closers.push(
      () => client.close(),
      () => server.close(),
    );
    const bad = await client.callTool({ name: 'boot_app', arguments: { name: 'broken' } });
    expect(bad.isError).toBe(true);
    expect(live).toBe(0);
    const good = await client.callTool({ name: 'boot_app', arguments: { name: 'shifa' } });
    expect(good.isError).toBeFalsy();
    expect(live).toBe(1);
  });
});
