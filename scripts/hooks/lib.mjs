// Pure helpers for the Kiro hooks in .kiro/hooks. Tested in tests/hooks-lib.test.ts.
import path from 'node:path';

const PATH_KEYS = new Set(['file_path', 'filePath', 'path', 'paths', 'file', 'files', 'uri']);
// Paths may contain spaces (this repo lives in "Matrix AE Hackathons"), but never line breaks.
const looksLikeFile = (s) => /\.[A-Za-z0-9]+$/.test(s) && !/[\r\n\t]/.test(s);

/**
 * file:///C:/a%20b/x.ts -> C:/a b/x.ts, file:///home/x.ts -> /home/x.ts. Other strings are returned
 * as they are. Parsed with URL (not fileURLToPath) so the result is the same on every OS.
 * @param {string} s
 */
export function fromFileUri(s) {
  if (!s.startsWith('file://')) return s;
  try {
    const p = decodeURIComponent(new URL(s).pathname);
    return /^\/[A-Za-z]:\//.test(p) ? p.slice(1) : p;
  } catch {
    return s;
  }
}

/**
 * Collects file paths from a hook event (JSON from stdin). The exact shape varies between
 * Kiro surfaces, so this looks for the usual keys at any depth.
 * @param {unknown} event
 * @returns {string[]}
 */
export function eventPaths(event) {
  const found = [];
  const visit = (value, key) => {
    if (typeof value === 'string') {
      const p = fromFileUri(value);
      if (PATH_KEYS.has(key) && looksLikeFile(p)) found.push(p);
    } else if (Array.isArray(value)) {
      for (const v of value) visit(v, key);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) visit(v, k);
    }
  };
  visit(event, '');
  return [...new Set(found)];
}

/**
 * Turns an absolute or relative path into forward-slash form relative to the repo root.
 * @param {string} file
 * @param {string} root
 */
export function relative(file, root) {
  const unix = (p) => p.replace(/\\/g, '/');
  const f = unix(file);
  const r = unix(root).replace(/\/$/, '');
  if (f.toLowerCase().startsWith(r.toLowerCase() + '/')) return f.slice(r.length + 1);
  return path.isAbsolute(file) ? unix(path.relative(root, file)) : f.replace(/^\.\//, '');
}

/**
 * The workspace package a source file belongs to, for packages/<name>/src/**.ts(x).
 * @param {string} file
 * @param {string} root
 * @returns {string | null}
 */
export function packageForFile(file, root) {
  const m = /^packages\/([^/]+)\/src\/.+\.tsx?$/.exec(relative(file, root));
  return m ? `@afterlife/${m[1]}` : null;
}

/**
 * True for files in packages/oracle or packages/vessel, whose property suites must re-run.
 * @param {string} file
 * @param {string} root
 */
export function isPbtTarget(file, root) {
  return /^packages\/(oracle|vessel)\//.test(relative(file, root));
}

/**
 * The route an App Router page file serves. Route groups are dropped and dynamic
 * segments get the sample value "demo".
 * @param {string} file
 * @param {string} root
 * @returns {string | null}
 */
export function routeForPage(file, root) {
  const m = /^apps\/web\/app\/(?:(.*)\/)?page\.tsx$/.exec(relative(file, root));
  if (!m) return null;
  const segments = (m[1] ?? '')
    .split('/')
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .map((s) => (/^\[.*\]$/.test(s) ? 'demo' : s));
  return '/' + segments.join('/');
}

/**
 * Completed checkbox tasks in a Kiro tasks.md, e.g. "- [x] 2.1 Parse header".
 * @param {string} markdown
 * @returns {{ id: string, title: string }[]}
 */
export function completedTasks(markdown) {
  const tasks = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^\s*[-*] \[[xX]\]\s+(\d+(?:\.\d+)*)\.?\s+(.*\S)\s*$/.exec(line);
    if (m) tasks.push({ id: m[1], title: m[2] });
  }
  return tasks;
}

/**
 * Completed tasks that no test file references with "@spec <spec>#<id>".
 * @param {string} spec
 * @param {{ id: string, title: string }[]} tasks
 * @param {Record<string, string>} testFiles file name -> contents
 */
export function untestedTasks(spec, tasks, testFiles) {
  const all = Object.values(testFiles).join('\n');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tasks.filter((t) => !new RegExp(`@spec ${esc(spec)}#${esc(t.id)}(?![\\d.])`).test(all));
}

const ALL_PACKAGES = 'pnpm exec vitest run --project "@afterlife/*"';
const A11Y = 'pnpm --filter @afterlife/e2e exec playwright test a11y.spec.ts';

/**
 * Decides what an event hook should run. A hook never passes without testing: if the event has
 * no usable file path, it runs everything and says why.
 * @param {string} hook
 * @param {unknown} event
 * @param {string} root
 * @returns {null | { kind: 'skip', reason: string } | { kind: 'run', cmd: string, label: string, env: Record<string, string>, note?: string }}
 */
export function planHook(hook, event, root) {
  const files = eventPaths(event);
  const keys = event && typeof event === 'object' ? Object.keys(event).join(', ') : typeof event;
  const note = files.length ? undefined : `No file path in the event (keys: ${keys || 'none'}).`;

  switch (hook) {
    case 'test-on-save': {
      if (!files.length)
        return { kind: 'run', cmd: ALL_PACKAGES, label: 'all packages', env: {}, note };
      const pkgs = [...new Set(files.map((f) => packageForFile(f, root)).filter(Boolean))];
      if (!pkgs.length)
        return { kind: 'skip', reason: 'No package source file in the event, nothing to test.' };
      return {
        kind: 'run',
        cmd: `pnpm exec vitest run ${pkgs.map((p) => `--project ${p}`).join(' ')}`,
        label: pkgs.join(', '),
        env: {},
      };
    }
    case 'pbt-on-oracle-change': {
      if (files.length && !files.some((f) => isPbtTarget(f, root)))
        return { kind: 'skip', reason: 'Not an oracle or vessel file, skipped.' };
      return {
        kind: 'run',
        cmd: 'pnpm exec vitest run --project @afterlife/oracle --project @afterlife/vessel',
        label: 'oracle + vessel suites',
        env: {},
        note,
      };
    }
    case 'a11y-check': {
      if (!files.length) return { kind: 'run', cmd: A11Y, label: 'all routes', env: {}, note };
      const routes = [...new Set(files.map((f) => routeForPage(f, root)).filter(Boolean))];
      if (!routes.length)
        return {
          kind: 'skip',
          reason: `No page file in the event (${files.map((f) => relative(f, root)).join(', ')}), skipped.`,
        };
      return {
        kind: 'run',
        cmd: A11Y,
        label: `axe on ${routes.join(', ')}`,
        env: { A11Y_ROUTES: routes.join(',') },
      };
    }
    default:
      return null;
  }
}
