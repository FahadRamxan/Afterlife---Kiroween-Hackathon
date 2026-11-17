#!/usr/bin/env node
// Entry point for every hook in .kiro/hooks. Usage: node scripts/hooks/run.mjs <hook-name>
// Reads the hook event JSON from stdin, runs the right checks, and prints a short summary.
// Exit 0 = passed or nothing to do. Exit 1 = a check failed (the summary goes to stderr too).
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { completedTasks, planHook, relative, untestedTasks } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hook = process.argv[2];

async function readStdin() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  const done = new Promise((resolve) => {
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', resolve);
    process.stdin.on('error', resolve);
    setTimeout(resolve, 2000);
  });
  await done;
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function run(cmd, env = {}) {
  const r = spawnSync(cmd, {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { ok: r.status === 0, tail: out.split(/\r?\n/).filter(Boolean).slice(-25).join('\n') };
}

// "kiro" when Kiro fires the hook, "test" when tests/hooks.test.ts runs it. Tests also write to a
// temp file, so .kiro/.hook-runs.jsonl only holds real firings.
const SOURCE = process.env.AFTERLIFE_HOOK_SOURCE ?? 'kiro';
const LOG = process.env.AFTERLIFE_HOOK_LOG ?? path.join(ROOT, '.kiro', '.hook-runs.jsonl');

function log(entry) {
  mkdirSync(path.dirname(LOG), { recursive: true });
  appendFileSync(
    LOG,
    JSON.stringify({ at: new Date().toISOString(), hook, source: SOURCE, ...entry }) + '\n',
  );
}

function walk(dir, match, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.next') || name === 'dist') continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, match, out);
    else if (match(name)) out.push(p);
  }
  return out;
}

function finish(ok, summary) {
  log({ ok, summary: summary.split('\n')[0] });
  console.log(`[${hook}] ${summary}`);
  if (!ok) {
    console.error(`[${hook}] ${summary}`);
    process.exit(1);
  }
}

const event = await readStdin();

const plan = planHook(hook, event, ROOT);
if (plan?.kind === 'skip') finish(true, plan.reason);
else if (plan?.kind === 'run') {
  if (plan.note) console.log(`[${hook}] ${plan.note} Running ${plan.label} instead.`);
  const r = run(plan.cmd, plan.env);
  finish(
    r.ok,
    `${r.ok ? 'PASS' : 'FAIL'} ${plan.label}${plan.note ? ` (${plan.note})` : ''}\n${r.tail}`,
  );
} else {
  runOther();
}

function runOther() {
  switch (hook) {
    case 'spec-sync': {
      const specsDir = path.join(ROOT, '.kiro/specs');
      const testFiles = Object.fromEntries(
        ['packages', 'apps', 'tests', 'e2e']
          .flatMap((d) => walk(path.join(ROOT, d), (n) => /\.(test|spec)\.tsx?$/.test(n)))
          .map((f) => [relative(f, ROOT), readFileSync(f, 'utf8')]),
      );
      const problems = [];
      let checked = 0;
      for (const spec of existsSync(specsDir) ? readdirSync(specsDir) : []) {
        const tasksFile = path.join(specsDir, spec, 'tasks.md');
        if (!existsSync(tasksFile)) continue;
        const done = completedTasks(readFileSync(tasksFile, 'utf8'));
        checked += done.length;
        for (const t of untestedTasks(spec, done, testFiles))
          problems.push(`${spec}#${t.id} ${t.title}`);
      }
      finish(
        problems.length === 0,
        problems.length
          ? `${problems.length} completed task(s) have no test with "@spec <spec>#<id>":\n${problems.join('\n')}`
          : `All ${checked} completed spec task(s) are referenced by a test.`,
      );
      break;
    }
    case 'verify': {
      const r = run('pnpm verify');
      finish(r.ok, `${r.ok ? 'PASS' : 'FAIL'} pnpm verify\n${r.tail}`);
      break;
    }
    default:
      console.error(`Unknown hook "${hook}".`);
      process.exit(2);
  }
}
