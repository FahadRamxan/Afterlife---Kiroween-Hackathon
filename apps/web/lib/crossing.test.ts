// @spec undertaker#4.1 The data crossing's progress and report (Prompt 66).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CrossingSchema, crossingProgress } from './crossing';
import type { LiveEvent } from './live';

let seq = 0;
const ev = (type: string, payload: unknown): LiveEvent => ({ seq: ++seq, type, at: '', payload });
const mig = (file: string, crossed: number, of = 40) =>
  ev('migration', { file, entity: 'x', crossed, rejected: 0, of });

describe('crossingProgress', () => {
  it('each table’s newest progress, in the order they crossed', () => {
    expect(
      crossingProgress([
        mig('MEDICINE.DBF', 40),
        ev('log', { message: 'x' }),
        mig('BILLS.DBF', 3, 3),
        ev('migration', { nonsense: true }),
      ]),
    ).toEqual([
      { file: 'MEDICINE.DBF', crossed: 40, rejected: 0, of: 40 },
      { file: 'BILLS.DBF', crossed: 3, rejected: 0, of: 3 },
    ]);
  });

  it('a new run of the step starts again', () => {
    expect(
      crossingProgress([
        mig('MEDICINE.DBF', 40),
        ev('step', { step: 'undertake', state: 'started', attempt: 2 }),
        mig('BILLS.DBF', 3, 3),
      ]).map((x) => x.file),
    ).toEqual(['BILLS.DBF']);
  });

  it('one entry per table whatever the events (invariant)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom('A.DBF', 'B.DBF', 'C.DBF'), fc.nat(50)), {
          maxLength: 30,
        }),
        (xs) => {
          const p = crossingProgress(xs.map(([f, n]) => mig(f, n, 50)));
          expect(new Set(p.map((x) => x.file)).size).toBe(p.length);
          for (const x of p) expect(x.crossed).toBe(xs.filter(([f]) => f === x.file).at(-1)![1]);
        },
      ),
    );
  });
});

describe('CrossingSchema', () => {
  it('reads the undertake step’s report as the steps API gives it', () => {
    const c = CrossingSchema.parse({
      tables: [
        {
          file: 'MEDICINE.DBF',
          entity: 'medicine',
          read: 40,
          deleted: 0,
          migrated: 39,
          rejected: 1,
        },
      ],
      rejected: [{ file: 'MEDICINE.DBF', recno: 2, field: 'EXPIRY', reason: 'r', fix: 'f' }],
      reconciliation: {
        matches: true,
        lines: [
          {
            table: 'MEDICINE.DBF',
            total: 'records',
            before: '40',
            rejected: '1',
            after: '39',
            ok: true,
          },
        ],
      },
    });
    expect(c.reconciliation.matches).toBe(true);
  });
});
