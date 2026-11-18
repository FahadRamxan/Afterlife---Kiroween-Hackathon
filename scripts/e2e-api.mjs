#!/usr/bin/env node
// The API and the worker for Playwright, on a real Postgres 16: starts a throwaway database in
// Docker (or uses E2E_DATABASE_URL), then both with DATABASE_URL pointing at it. They migrate it.
// Playwright stops this process when the run ends; the container goes with it. A container left
// behind by a killed run is removed the next time.
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';

const LABEL = 'afterlife-e2e=1';
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function stale() {
  try {
    const ids = docker('ps', '-aq', '--filter', `label=${LABEL}`).split('\n').filter(Boolean);
    if (ids.length) docker('rm', '-f', ...ids);
  } catch {
    /* Docker not running: the run below says so */
  }
}

/** True once something accepts TCP connections on the port. */
const open = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

let container;
let url = process.env.E2E_DATABASE_URL;
if (!url) {
  stale();
  try {
    container = docker(
      'run',
      '-d',
      '--rm',
      '--label',
      LABEL,
      '-e',
      'POSTGRES_PASSWORD=e2e',
      '-e',
      'POSTGRES_DB=afterlife',
      '-p',
      '127.0.0.1::5432',
      'postgres:16-alpine',
      '-c',
      'fsync=off',
    );
  } catch (e) {
    console.error(
      `e2e needs Postgres: start Docker, or set E2E_DATABASE_URL. (${e.message.split('\n')[0]})`,
    );
    process.exit(1);
  }
  const port = Number(docker('port', container, '5432/tcp').split('\n')[0].split(':').at(-1));
  url = `postgres://postgres:e2e@127.0.0.1:${port}/afterlife`;
  // The image's first start runs initdb with TCP off, then restarts with TCP on.
  const end = Date.now() + 60_000;
  while (!(await open(port))) {
    if (Date.now() > end) {
      console.error('Postgres did not start');
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  // TCP is up a moment before the server takes logins; the API retries nothing, so wait.
  for (let i = 0; i < 40; i++) {
    try {
      docker(
        'exec',
        container,
        'pg_isready',
        '-U',
        'postgres',
        '-d',
        'afterlife',
        '-h',
        '127.0.0.1',
      );
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

const api = spawn('pnpm', ['--filter', '@afterlife/api', 'start'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});
const stop = () => {
  if (container) {
    try {
      docker('rm', '-f', container);
    } catch {
      /* already gone */
    }
    container = undefined;
  }
};
// The worker too: Raise queues possession, and the live view (Prompt 38) shows what it does.
const worker = spawn('pnpm', ['--filter', '@afterlife/worker', 'start'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: url, JSDOS_POOL_SIZE: '1' },
});
worker.on('exit', (code) => {
  if (code) console.error(`the e2e worker stopped with code ${code}`);
});
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => (api.kill(sig), worker.kill(sig), stop(), process.exit(0)));
api.on('exit', (code) => (worker.kill(), stop(), process.exit(code ?? 0)));
