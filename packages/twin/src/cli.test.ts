// @spec ghost-twin#1.2 Prompt 76 done when: the CLI detects changes in a temp folder and posts
// events, and a mock API test. The real CLI (afterlife-twin) as a child process, against a mock API.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeDbf, type DbfTable } from '@afterlife/dbf';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { httpPoster } from './http';
import { parseCli } from './cli-args';

const PROJECT = '0192b6a0-0000-7000-8000-000000000001';
const TOKEN = 'tw_secret-token';
const TABLE: DbfTable = {
  fields: [
    { name: 'CODE', type: 'C', length: 6, decimals: 0 },
    { name: 'QTY', type: 'N', length: 5, decimals: 0 },
  ],
  records: [{ deleted: false, values: { CODE: 'PAN500', QTY: '240' } }],
};

type Got = { method: string; url: string; auth: string | undefined; body: Record<string, unknown> };
let server: Server;
let api: string;
let got: Got[];
let answer: (g: Got) => number;
let reply: (g: Got) => string;
const posts = () => got.filter((g) => g.method === 'POST');
const read = (req: IncomingMessage) =>
  new Promise<string>((ok) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => ok(s));
  });
beforeEach(async () => {
  got = [];
  answer = () => 201;
  reply = () => '{"message":"x"}';
  server = createServer(async (req, res) => {
    const g: Got = {
      method: req.method!,
      url: req.url!,
      auth: req.headers.authorization,
      body: JSON.parse((await read(req)) || '{}'),
    };
    got.push(g);
    res.writeHead(answer(g), { 'content-type': 'application/json' }).end(reply(g));
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

describe('httpPoster (a mock API)', () => {
  const event = {
    seq: 3,
    occurredAt: '1998-07-15T10:00:00.000Z',
    files: ['MEDICINE.DBF'],
    diff: { tables: {}, unchanged: [], addedTables: [], removedTables: [] },
  };
  it('posts each event to the project, with the twin token', async () => {
    await expect(httpPoster({ api, projectId: PROJECT, token: TOKEN })(event)).resolves.toBe(3);
    // First it asks the twin for its newest change (none here), once.
    expect(got[0]).toMatchObject({ method: 'GET', url: `/api/projects/${PROJECT}/twin` });
    expect(posts()).toEqual([
      {
        method: 'POST',
        url: `/api/projects/${PROJECT}/twin/events`,
        auth: `Bearer ${TOKEN}`,
        body: event,
      },
    ]);
  });
  it('a capture started again goes on from the newest change the API has, so its changes are not taken as already there', async () => {
    reply = (g) => (g.method === 'GET' ? '{"lastSeq":40}' : '{}');
    const post = httpPoster({ api, projectId: PROJECT, token: TOKEN });
    await expect(post(event)).resolves.toBe(43);
    await expect(post({ ...event, seq: 4 })).resolves.toBe(44);
    expect(posts().map((g) => g.body.seq)).toEqual([43, 44]);
    expect(got.filter((g) => g.method === 'GET')).toHaveLength(1);
  });
  it('an event the API already has (409) is done; a refusal or an error is thrown, to be sent again', async () => {
    answer = (g) => (g.method === 'GET' ? 200 : 409);
    await expect(httpPoster({ api, projectId: PROJECT, token: TOKEN })(event)).resolves.toBe(3);
    answer = (g) => (g.method === 'GET' ? 200 : 401);
    await expect(httpPoster({ api, projectId: PROJECT, token: TOKEN })(event)).rejects.toThrow(
      'The API refused the twin token (401)',
    );
    answer = (g) => (g.method === 'GET' ? 200 : 500);
    await expect(httpPoster({ api, projectId: PROJECT, token: TOKEN })(event)).rejects.toThrow(
      '500',
    );
    // Asking for the twin fails too: thrown, and asked again on the next send.
    answer = () => 503;
    const post = httpPoster({ api, projectId: PROJECT, token: TOKEN });
    await expect(post(event)).rejects.toThrow('503');
    answer = () => 201;
    await expect(post(event)).resolves.toBe(3);
  });
  it('after the switch-over (409 SWITCHED) it stops for good instead of counting the change as sent', async () => {
    answer = (g) => (g.method === 'GET' ? 200 : 409);
    reply = (g) =>
      g.method === 'GET' ? '{"lastSeq":7}' : '{"error":"SWITCHED","message":"frozen"}';
    await expect(
      httpPoster({ api, projectId: PROJECT, token: TOKEN })(event),
    ).rejects.toMatchObject({ name: 'TwinStoppedError', fatal: true });
  });
});

describe('parseCli', () => {
  it('takes flags, or the environment, and says what is missing', () => {
    expect(
      parseCli(['--api', api, '--project', PROJECT, '--dir', '.', '--interval', '250'], {
        AFTERLIFE_TWIN_TOKEN: TOKEN,
      }),
    ).toEqual({
      ok: true,
      options: { api, project: PROJECT, token: TOKEN, dir: '.', intervalMs: 250 },
    });
    const bad = parseCli(['--dir', '.'], {});
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/--api.*--project.*--token/s);
    expect(
      parseCli(['--api', api, '--project', 'nope', '--token', 't', '--dir', '.'], {}),
    ).toMatchObject({ ok: false, message: expect.stringContaining('project id') });
  });
});

describe('the afterlife-twin CLI', () => {
  let dir: string;
  let cli: ChildProcess | null = null;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'twin-cli-'));
    writeFileSync(path.join(dir, 'MEDICINE.DBF'), writeDbf(TABLE));
  });
  afterEach(() => {
    cli?.kill();
    rmSync(dir, { recursive: true, force: true });
  });
  it('sees a change in the folder and posts it as a twin event', async () => {
    // The CLI as a shop PC runs it: not inside vitest's own worker options.
    const rest = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !/^(NODE_OPTIONS|VITEST)/.test(k)),
    );
    const childEnv = { ...rest, AFTERLIFE_TWIN_TOKEN: TOKEN };
    cli = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        path.join(__dirname, 'cli.ts'),
        '--api',
        api,
        '--project',
        PROJECT,
        '--dir',
        dir,
        '--interval',
        '150',
      ],
      { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    cli.stdout!.on('data', (c) => (out += c));
    cli.stderr!.on('data', (c) => (out += c));
    cli.on('exit', (code) => (out += `\n[exited with ${code}]`));
    const until = async (ok: () => boolean, ms = 15_000) => {
      const end = Date.now() + ms;
      while (!ok()) {
        if (Date.now() > end) throw new Error(`timed out; the CLI said:\n${out}`);
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    // Starting tsx in a child process is the slow part on a loaded machine (the full CI run).
    await until(() => out.includes('watching'), 60_000);
    // The DOS app sells 2 strips of Panadol.
    writeFileSync(
      path.join(dir, 'MEDICINE.DBF'),
      writeDbf({ ...TABLE, records: [{ deleted: false, values: { CODE: 'PAN500', QTY: '238' } }] }),
    );
    await until(() => posts().length > 0);
    expect(posts()[0]).toMatchObject({
      method: 'POST',
      url: `/api/projects/${PROJECT}/twin/events`,
      auth: `Bearer ${TOKEN}`,
    });
    expect(posts()[0]!.body).toMatchObject({ seq: 1, files: ['MEDICINE.DBF'] });
    const diff = posts()[0]!.body.diff as {
      tables: Record<string, { updated: { changes: unknown[] }[] }>;
    };
    expect(diff.tables['MEDICINE.DBF']!.updated[0]!.changes).toEqual([
      { field: 'QTY', before: '240', after: '238', delta: '-2' },
    ]);
    // The token is never printed.
    await until(() => out.includes('sent change 1'));
    expect(out).not.toContain(TOKEN);
  }, 90_000);
});
