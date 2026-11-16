#!/usr/bin/env node
// Builds nothing. Runs the locally built images and checks they behave:
//   API: answers /health with CORS for the allowed origin, runs as a non-root user, stops on SIGTERM.
//   Worker: starts, logs, stops on SIGTERM with exit code 0.
// Usage: docker build -f apps/api/Dockerfile -t afterlife-api:local . (same for worker), then
//        node scripts/docker-smoke.mjs
import { execFileSync } from 'node:child_process';

const sh = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
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

quiet('rm', '-f', 'al-api', 'al-worker');
sh(
  'run',
  '-d',
  '--name',
  'al-api',
  '-p',
  '4100:4000',
  '-e',
  'WEB_ORIGINS=https://afterlife.example',
  'afterlife-api:local',
);
sh('run', '-d', '--name', 'al-worker', 'afterlife-worker:local');

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
    if (res.headers.get('access-control-allow-origin') !== 'https://afterlife.example')
      fail('API CORS');
  }
  const user = sh('exec', 'al-api', 'whoami');
  console.log(`api user ${user}`);
  if (user !== 'node') fail('API runs as root');

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
  quiet('rm', '-f', 'al-api', 'al-worker');
}
console.log(process.exitCode ? 'docker smoke FAILED' : 'docker smoke PASSED');
