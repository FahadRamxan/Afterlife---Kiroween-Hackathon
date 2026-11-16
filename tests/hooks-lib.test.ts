import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  completedTasks,
  eventPaths,
  isPbtTarget,
  packageForFile,
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
    const seg = fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/);
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
