import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS_DIR,
  MigrationError,
  loadMigrations,
  planDown,
  planUp,
  readMigrations,
  splitStatements,
} from './migrate';

const BREAK = '--> statement-breakpoint';

describe('splitStatements', () => {
  it('splits drizzle-kit output on its breakpoints and drops blanks', () => {
    expect(splitStatements(`CREATE TABLE a();\n${BREAK}\n\nCREATE TABLE b();\n${BREAK}\n`)).toEqual(
      ['CREATE TABLE a();', 'CREATE TABLE b();'],
    );
  });

  it('a hand-written file without breakpoints is one statement', () => {
    expect(splitStatements('DROP TABLE a;\nDROP TABLE b;\n')).toEqual([
      'DROP TABLE a;\nDROP TABLE b;',
    ]);
  });

  it('round-trip: joining statements with breakpoints and splitting gives them back', () => {
    const stmt = fc
      .string({ minLength: 1 })
      .map((s) => s.replaceAll('-->', '').trim())
      .filter((s) => s.length > 0);
    fc.assert(
      fc.property(fc.array(stmt), (stmts) => {
        expect(splitStatements(stmts.join(`\n${BREAK}\n`))).toEqual(stmts);
      }),
    );
  });
});

describe('loadMigrations', () => {
  it('pairs each up file with its .down.sql, in order', () => {
    const m = loadMigrations({
      '0001_b.sql': 'B',
      '0000_a.sql': 'A',
      '0000_a.down.sql': 'undo A',
      '0001_b.down.sql': 'undo B',
    });
    expect(m).toEqual([
      { id: '0000_a', up: ['A'], down: ['undo A'] },
      { id: '0001_b', up: ['B'], down: ['undo B'] },
    ]);
  });

  it('refuses a migration without a down, a down without a migration, and a bad name', () => {
    expect(() => loadMigrations({ '0000_a.sql': 'A' })).toThrow(/0000_a has no 0000_a\.down\.sql/);
    expect(() => loadMigrations({ '0000_a.down.sql': 'A' })).toThrow(/no 0000_a\.sql/);
    expect(() => loadMigrations({ 'init.sql': 'A' })).toThrow(MigrationError);
  });

  it('ignores files that are not SQL (drizzle-kit keeps its snapshots in meta/)', () => {
    expect(
      loadMigrations({ 'README.md': 'x', '0000_a.sql': 'A', '0000_a.down.sql': 'B' }),
    ).toHaveLength(1);
  });
});

describe('planUp and planDown', () => {
  const ids = fc
    .uniqueArray(fc.stringMatching(/^\d{4}_[a-z]{1,6}$/), { maxLength: 8 })
    .map((a) => a.sort());

  it('up applies exactly the migrations not yet applied, in order', () => {
    fc.assert(
      fc.property(ids, fc.nat(), (known, n) => {
        const applied = known.slice(0, n % (known.length + 1));
        expect(planUp(known, applied)).toEqual(known.slice(applied.length));
      }),
    );
  });

  it('down undoes the newest applied migrations first', () => {
    fc.assert(
      fc.property(ids, fc.nat(), fc.nat(), (known, n, steps) => {
        const applied = known.slice(0, n % (known.length + 1));
        const plan = planDown(known, applied, steps);
        expect(plan).toEqual(applied.slice().reverse().slice(0, steps));
      }),
    );
  });

  it('up then down all the way leaves nothing applied (invariant)', () => {
    fc.assert(
      fc.property(ids, (known) => {
        const up = planUp(known, []);
        expect(planDown(known, up, Infinity)).toEqual(up.slice().reverse());
      }),
    );
  });

  it('refuses a database that has migrations this code does not know (newer code ran on it)', () => {
    expect(() => planUp(['0000_a'], ['0000_a', '0001_b'])).toThrow(/0001_b/);
    expect(() => planDown(['0000_a'], ['0000_a', '0001_b'], 1)).toThrow(/0001_b/);
    // A gap: an older migration file was removed or renamed after it ran.
    expect(() => planUp(['0000_a', '0002_c'], ['0001_b'])).toThrow(MigrationError);
  });
});

describe('the migrations in this repo', () => {
  it('every up migration has a down migration and they load', () => {
    const m = readMigrations();
    expect(m.length).toBeGreaterThanOrEqual(1);
    for (const x of m) {
      expect(x.up.length).toBeGreaterThan(0);
      expect(x.down.length).toBeGreaterThan(0);
    }
  });

  it('match the drizzle-kit journal, so `drizzle-kit generate` stays in step', () => {
    const journal = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
    ) as {
      entries: { tag: string }[];
    };
    expect(readMigrations().map((m) => m.id)).toEqual(journal.entries.map((e) => e.tag));
    expect(readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))).toHaveLength(
      journal.entries.length * 2,
    );
  });
});
