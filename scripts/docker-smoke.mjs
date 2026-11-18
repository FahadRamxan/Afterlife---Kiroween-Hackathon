#!/usr/bin/env node
// Builds nothing. Runs the locally built images and checks they behave:
//   API: on a Postgres 16 container it migrates the database and says so on /health, answers
//        /health with CORS for the allowed origin, runs as a non-root user, stops on SIGTERM.
//   Worker: on the same Postgres it starts its pg-boss job loop, runs as a non-root user, and
//           stops on SIGTERM with exit code 0. Inside the image it boots the real Shifa EXE in
//           two headless js-dos emulators at once and reports the memory that takes.
// Usage: docker build -f apps/api/Dockerfile -t afterlife-api:local . (same for worker), then
//        node scripts/docker-smoke.mjs
import { execFileSync } from 'node:child_process';

const sh = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const quiet = (...args) => {
  try {
    sh(...args);
  } catch {
    /* container may not exist */
  }
};
const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
};

quiet('rm', '-f', 'al-api', 'al-worker', 'al-pg', 'al-boot');
quiet('network', 'rm', 'al-net');
sh('network', 'create', 'al-net');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls a container's output until it matches, or gives up. */
async function waitForLog(name, re, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const out = execFileSync('docker', ['logs', name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (re.test(out)) return out;
    await sleep(500);
  }
  return null;
}
sh(
  'run',
  '-d',
  '--name',
  'al-pg',
  '--network',
  'al-net',
  '-e',
  'POSTGRES_PASSWORD=smoke',
  'postgres:16-alpine',
);
// The API migrates on start and refuses to start without its database: wait for Postgres first.
let pgReady = false;
for (let i = 0; i < 120 && !pgReady; i++) {
  try {
    sh('exec', 'al-pg', 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1');
    pgReady = true;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!pgReady) fail('Postgres never became ready');
sh(
  'run',
  '-d',
  '--name',
  'al-api',
  '--network',
  'al-net',
  '-p',
  '4100:4000',
  '-e',
  'WEB_ORIGINS=https://afterlife.example',
  '-e',
  'DATABASE_URL=postgres://postgres:smoke@al-pg:5432/postgres',
  'afterlife-api:local',
);
sh(
  'run',
  '-d',
  '--name',
  'al-worker',
  '--network',
  'al-net',
  '-e',
  'DATABASE_URL=postgres://postgres:smoke@al-pg:5432/postgres',
  'afterlife-worker:local',
);

try {
  let res;
  for (let i = 0; i < 30 && !res; i++) {
    try {
      res = await fetch('http://localhost:4100/health', {
        headers: { origin: 'https://afterlife.example' },
      });
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!res) fail('API never answered');
  else {
    const body = await res.json();
    console.log(`api /health ${res.status} ${JSON.stringify(body)}`);
    console.log(`api cors ${res.headers.get('access-control-allow-origin')}`);
    if (res.status !== 200 || body.status !== 'ok') fail('API /health');
    if (body.storage !== 'postgres') fail('API is not on Postgres');
    const tables = sh(
      'exec',
      'al-pg',
      'psql',
      '-U',
      'postgres',
      '-tAc',
      "select count(*) from information_schema.tables where table_schema = 'public'",
    );
    console.log(`postgres tables ${tables}`);
    if (Number(tables) < 12) fail('the API did not migrate the database');
    if (res.headers.get('access-control-allow-origin') !== 'https://afterlife.example')
      fail('API CORS');
  }
  const user = sh('exec', 'al-api', 'whoami');
  console.log(`api user ${user}`);
  if (user !== 'node') fail('API runs as root');

  if (!(await waitForLog('al-worker', /afterlife worker started/, 60_000)))
    fail('worker never started its job loop');
  const wUser = sh('exec', 'al-worker', 'whoami');
  console.log(`worker user ${wUser}`);
  if (wUser !== 'node') fail('worker runs as root');
  const queues = sh(
    'exec',
    'al-pg',
    'psql',
    '-U',
    'postgres',
    '-tAc',
    // Ours only: pg-boss keeps queues of its own there too.
    "select count(*) from pgboss.queue where name in ('possess', 'archaeology', 'rebirth', 'undertake', 'prove', 'exorcise', 'twin-replay', 'voice-change')",
  );
  console.log(`pg-boss queues ${queues}`);
  if (Number(queues) !== 8) fail('the worker did not make its 8 queues');

  // Chromium in the image: two Shifa emulators at once, held 8 s while the memory is read.
  sh(
    'run',
    '-d',
    '--name',
    'al-boot',
    'afterlife-worker:local',
    'node',
    '--import',
    'tsx',
    'src/smoke-boot.ts',
    '2',
    '8000',
  );
  const booted = await waitForLog('al-boot', /BOOTED[^\n]*\n[^]*BOOTED/, 120_000);
  if (!booted) fail('Shifa did not boot twice inside the worker image');
  else {
    const mem = sh('stats', '--no-stream', '--format', '{{.MemUsage}}', 'al-boot');
    console.log(`worker image, 2 Shifa emulators: ${mem}`);
  }
  sh('wait', 'al-boot');
  const bootLogs = sh('logs', 'al-boot');
  console.log(`boot logs:\n${bootLogs}`);
  if (!/SMOKE BOOT OK 2/.test(bootLogs)) fail('smoke boot did not finish');
  if (sh('inspect', 'al-boot', '--format', '{{.State.ExitCode}}') !== '0')
    fail('smoke boot exit code');

  sh('stop', '-t', '10', 'al-worker');
  console.log(`worker logs:\n${sh('logs', 'al-worker')}`);
  const wExit = sh('inspect', 'al-worker', '--format', '{{.State.ExitCode}}');
  console.log(`worker exit ${wExit}`);
  if (wExit !== '0') fail('worker did not stop cleanly');

  sh('stop', '-t', '10', 'al-api');
  const aExit = sh('inspect', 'al-api', '--format', '{{.State.ExitCode}}');
  console.log(`api exit ${aExit}`);
  if (aExit !== '0') fail('API did not stop cleanly');
} finally {
  if (process.exitCode) {
    try {
      console.log(`api logs:\n${execFileSync('docker', ['logs', 'al-api'], { encoding: 'utf8' })}`);
    } catch {
      /* no API container */
    }
  }
  quiet('rm', '-f', 'al-api', 'al-worker', 'al-pg', 'al-boot');
  quiet('network', 'rm', 'al-net');
}
console.log(process.exitCode ? 'docker smoke FAILED' : 'docker smoke PASSED');
