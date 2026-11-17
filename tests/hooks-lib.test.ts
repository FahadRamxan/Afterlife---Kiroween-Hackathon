import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  completedTasks,
  eventPaths,
  isPbtTarget,
  packageForFile,
  planHook,
  routeForPage,
  untestedTasks,
} from '../scripts/hooks/lib.mjs';

const ROOT = 'C:\\repo';

describe('eventPaths', () => {
  it('finds file paths in common event shapes', () => {
    expect(eventPaths({ file_path: 'packages/dbf/src/a.ts' })).toEqual(['packages/dbf/src/a.ts']);
    expect(eventPaths({ tool_input: { path: 'x/y.ts' } })).toEqual(['x/y.ts']);
    expect(eventPaths({ files: ['a.ts', 'b.tsx'], cwd: '/w' })).toEqual(['a.ts', 'b.tsx']);
  });

  it('ignores non-path strings such as session ids and cwd', () => {
    expect(
      eventPaths({ session_id: 'abc-123', cwd: '/w', hook_event_name: 'PostFileSave' }),
    ).toEqual([]);
  });

  it('returns no duplicates', () => {
    expect(eventPaths({ path: 'a.ts', filePath: 'a.ts' })).toEqual(['a.ts']);
  });
});

describe('packageForFile', () => {
  it('maps a package source file to its workspace name', () => {
    expect(packageForFile('packages/dbf/src/reader.ts', ROOT)).toBe('@afterlife/dbf');
    expect(packageForFile('packages\\mcp-emulator\\src\\server.ts', ROOT)).toBe(
      '@afterlife/mcp-emulator',
    );
    expect(packageForFile('C:\\repo\\packages\\soul\\src\\deep\\ir.ts', ROOT)).toBe(
      '@afterlife/soul',
    );
  });

  it('returns null outside packages/*/src or for non-ts files', () => {
    expect(packageForFile('apps/web/app/page.tsx', ROOT)).toBeNull();
    expect(packageForFile('packages/dbf/README.md', ROOT)).toBeNull();
    expect(packageForFile('packages/dbf/package.json', ROOT)).toBeNull();
  });

  it('property: any packages/<name>/src/**.ts path maps to @afterlife/<name>', () => {
    // = /^[a-z][a-z0-9-]{0,12}$/, built from characters (fc.stringMatching is slow at 2000 runs).
    const seg = fc
      .tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'),
        fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'), { maxLength: 12 }),
      )
      .map(([a, rest]) => a + rest.join(''));
    fc.assert(
      fc.property(seg, fc.array(seg, { maxLength: 3 }), seg, (pkg, dirs, file) => {
        const p = ['packages', pkg, 'src', ...dirs, `${file}.ts`].join('/');
        expect(packageForFile(p, ROOT)).toBe(`@afterlife/${pkg}`);
      }),
    );
  });
});

describe('isPbtTarget', () => {
  it('is true only for oracle and vessel', () => {
    expect(isPbtTarget('packages/oracle/src/run.ts', ROOT)).toBe(true);
    expect(isPbtTarget('packages/vessel/src/x.prop.test.ts', ROOT)).toBe(true);
    expect(isPbtTarget('packages/dbf/src/x.ts', ROOT)).toBe(false);
  });
});

describe('routeForPage', () => {
  it('maps App Router pages to routes', () => {
    expect(routeForPage('apps/web/app/page.tsx', ROOT)).toBe('/');
    expect(routeForPage('apps/web/app/graveyard/page.tsx', ROOT)).toBe('/graveyard');
    expect(routeForPage('apps/web/app/(studio)/design/page.tsx', ROOT)).toBe('/design');
  });

  it('fills dynamic segments with a sample value', () => {
    expect(routeForPage('apps/web/app/raise/[projectId]/page.tsx', ROOT)).toBe('/raise/demo');
  });

  it('returns null for components that are not pages', () => {
    expect(routeForPage('apps/web/app/components/Button.tsx', ROOT)).toBeNull();
    expect(routeForPage('packages/ui/src/Button.tsx', ROOT)).toBeNull();
  });
});

describe('spec-sync task checks', () => {
  const tasks = [
    '# Tasks',
    '- [x] 1. Write round-trip property',
    '- [ ] 2. Implement reader',
    '  - [x] 2.1 Parse header',
    '- [X] 3. Golden test',
  ].join('\n');

  it('lists completed tasks with their ids', () => {
    expect(completedTasks(tasks)).toEqual([
      { id: '1', title: 'Write round-trip property' },
      { id: '2.1', title: 'Parse header' },
      { id: '3', title: 'Golden test' },
    ]);
  });

  it('reports completed tasks that no test references', () => {
    const tests = { 'a.test.ts': '// @spec dbf-reader#1\n', 'b.test.ts': '// @spec dbf-reader#3' };
    expect(untestedTasks('dbf-reader', completedTasks(tasks), tests)).toEqual([
      { id: '2.1', title: 'Parse header' },
    ]);
  });

  it('does not confuse task 1 with task 1.2 or 11', () => {
    const tests = { 'a.test.ts': '// @spec s#1.2\n// @spec s#11' };
    expect(untestedTasks('s', [{ id: '1', title: 't' }], tests)).toEqual([{ id: '1', title: 't' }]);
  });
});

// Review finding 1: the repo lives in "Matrix AE Hackathons", so real Kiro events carry
// absolute paths with spaces, or file:// URIs with %20.
describe('full paths with spaces (review fix)', () => {
  const REAL = 'C:\\Users\\fahad\\Downloads\\Matrix AE Hackathons\\Afterlife---Kiroween-Hackathon';
  const win = `${REAL}\\packages\\dbf\\src\\index.ts`;
  const fwd = win.replace(/\\/g, '/');
  const uri = 'file:///' + fwd.replace(/ /g, '%20');

  it.each([
    ['Windows absolute path', win],
    ['forward-slash absolute path', fwd],
    ['file:// URI', uri],
  ])('eventPaths keeps a %s', (_label, p) => {
    expect(eventPaths({ file_path: p })).toHaveLength(1);
  });

  it('decodes file:// URIs into plain paths', () => {
    expect(eventPaths({ uri })).toEqual([fwd]);
  });

  it.each([
    ['Windows absolute path', win],
    ['forward-slash absolute path', fwd],
    ['file:// URI', uri],
  ])('packageForFile resolves a %s to @afterlife/dbf', (_label, p) => {
    const [found] = eventPaths({ file_path: p });
    expect(packageForFile(found!, REAL)).toBe('@afterlife/dbf');
  });

  it('routeForPage works with a path with spaces', () => {
    expect(routeForPage(`${REAL}\\apps\\web\\app\\graveyard\\page.tsx`, REAL)).toBe('/graveyard');
  });

  it('relative paths still work', () => {
    expect(packageForFile('packages/dbf/src/index.ts', REAL)).toBe('@afterlife/dbf');
  });

  it('still ignores strings that are not paths', () => {
    expect(eventPaths({ path: 'hello world' })).toEqual([]);
    expect(eventPaths({ path: 'two\nlines.ts' })).toEqual([]);
  });
});

describe('planHook (review fix: never pass without testing)', () => {
  const R = 'C:\\repo';
  /** Narrows a plan to a run, failing the test if it is not one. */
  const asRun = (p: ReturnType<typeof planHook>) => {
    if (p?.kind !== 'run') throw new Error(`expected a run plan, got ${JSON.stringify(p)}`);
    return p;
  };

  it('test-on-save runs the saved package', () => {
    const p = planHook('test-on-save', { file_path: 'C:\\repo\\packages\\dbf\\src\\a.ts' }, R);
    expect(p).toMatchObject({ kind: 'run', label: '@afterlife/dbf' });
    expect(asRun(p).cmd).toBe('pnpm exec vitest run --project @afterlife/dbf');
  });

  it('test-on-save with no usable path runs every package and names the event keys', () => {
    const p = planHook('test-on-save', { hook_event_name: 'PostFileSave', session_id: 'x' }, R);
    expect(p).toMatchObject({ kind: 'run', label: 'all packages' });
    expect(asRun(p).cmd).toBe('pnpm exec vitest run --project "@afterlife/*"');
    expect(asRun(p).note).toContain('hook_event_name, session_id');
  });

  it('test-on-save skips a saved file that is not package source', () => {
    expect(planHook('test-on-save', { file_path: 'README.md' }, R)?.kind).toBe('skip');
  });

  it('a11y-check with no usable path checks every route', () => {
    const p = planHook('a11y-check', {}, R);
    expect(p).toMatchObject({ kind: 'run', label: 'all routes' });
    expect(asRun(p).env).toEqual({});
  });

  it('a11y-check on a page checks only that route', () => {
    const p = planHook('a11y-check', { file_path: 'C:\\repo\\apps\\web\\app\\page.tsx' }, R);
    expect(asRun(p).env).toEqual({ A11Y_ROUTES: '/' });
  });

  it('pbt-on-oracle-change runs the whole oracle and vessel suites, not only *.prop.test files', () => {
    const p = planHook('pbt-on-oracle-change', { file_path: 'packages/oracle/src/x.ts' }, R);
    expect(asRun(p).cmd).toBe(
      'pnpm exec vitest run --project @afterlife/oracle --project @afterlife/vessel',
    );
  });

  it('pbt-on-oracle-change with no usable path still runs', () => {
    expect(planHook('pbt-on-oracle-change', {}, R)?.kind).toBe('run');
  });

  it('returns null for hooks it does not plan', () => {
    expect(planHook('spec-sync', {}, R)).toBeNull();
  });
});
