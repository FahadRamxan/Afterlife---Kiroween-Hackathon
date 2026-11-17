// Pure helpers for the Kiro hooks in .kiro/hooks. Tested in tests/hooks-lib.test.ts.
import path from 'node:path';

const PATH_KEYS = new Set(['file_path', 'filePath', 'path', 'paths', 'file', 'files', 'uri']);
const looksLikeFile = (s) => /\.[A-Za-z0-9]+$/.test(s) && !/\s/.test(s);

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
      if (PATH_KEYS.has(key) && looksLikeFile(value)) found.push(value.replace(/^file:\/\//, ''));
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
