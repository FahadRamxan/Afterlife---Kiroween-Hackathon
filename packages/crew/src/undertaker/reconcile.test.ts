// @spec undertaker#3 Reconciliation (Prompt 65).
import type { DbfRecord } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { graveyardTables, readCsv } from '../archaeologist/testing/graveyard-runs';
import { migrate } from './migrate';
import { controlTotals, reconcile } from './reconcile';

const SOUL = SHIFA_REFERENCE_SOUL;
const seed = (app: string): Record<string, DbfRecord[]> =>
  Object.fromEntries(
    graveyardTables(app).map((f) => [`${f}.DBF`, readCsv(`${app}/seed/${f}.csv`).records]),
  );
const crossed = (soul: Soul, tables: Record<string, DbfRecord[]>) => {
  const m = migrate(soul, tables);
  return {
    m,
    after: Object.fromEntries(m.tables.map((t) => [t.file.toUpperCase(), t.migrated])),
  };
};

/** Barkat's entities: the ledger points at the party (its balance is what is outstanding). */
const BARKAT: Soul = {
  ...SOUL,
  entities: ['PARTY', 'LEDGER'].map((f) => ({
    id: f.toLowerCase(),
    name: f,
    file: `${f}.DBF`,
    fields: readCsv(`barkat/seed/${f}.csv`).fields,
    key: f === 'PARTY' ? ['PARTY_ID'] : ['ENTRY'],
    foreignKeys:
      f === 'LEDGER'
        ? [{ fields: ['PARTY_ID'], references: { entity: 'party', fields: ['PARTY_ID'] } }]
        : [],
    counters: [],
  })),
  actions: [],
  rules: [],
};

describe('controlTotals', () => {
  // @spec undertaker#3.1
  it('Shifa: counts, sums of every numeric field, and the stock value, in decimals', () => {
    const t = controlTotals(SOUL, seed('shifa'));
    const med = t.tables.find((x) => x.file === 'MEDICINE.DBF')!;
    expect(med.count).toBe(40);
    expect(Object.keys(med.sums)).toEqual(['PRICE', 'QTY']);
    // The stock is the medicines' (the bill lines point at them), not the bill lines'.
    const rows = seed('shifa')['MEDICINE.DBF']!;
    const value = rows.reduce(
      (s, r) => s + Math.round(Number(r.values.PRICE) * 100) * Number(r.values.QTY),
      0,
    );
    expect(t.stockValue).toBe((value / 100).toString());
    expect(t.balances).toEqual([]);
  });

  it('Barkat: the parties’ outstanding balances', () => {
    const t = controlTotals(BARKAT, seed('barkat'));
    const sum = seed('barkat')['PARTY.DBF']!.reduce(
      (s, r) => s + Math.round(Number(r.values.BALANCE) * 100),
      0,
    );
    expect(t.balances).toEqual([{ file: 'PARTY.DBF', total: (sum / 100).toString() }]);
  });
});

describe('reconcile', () => {
  // @spec undertaker#3.2
  it.each([
    ['shifa', SOUL],
    ['barkat', BARKAT],
  ] as const)('%s: a correct migration is all green', (app, soul) => {
    const old = seed(app);
    const { m, after } = crossed(soul, old);
    const r = reconcile(soul, old, after, m.rejected);
    expect(r.matches).toBe(true);
    expect(r.lines.every((l) => l.ok)).toBe(true);
    expect(
      r.lines.find((l) => l.table === 'MEDICINE.DBF' || l.table === 'PARTY.DBF'),
    ).toMatchObject({
      total: 'records',
      rejected: '0',
    });
  });

  it('a deliberately broken migration: a lost record, a changed one, an added one', () => {
    const old = seed('shifa');
    const { m, after } = crossed(SOUL, old);
    const lost = { ...after, 'MEDICINE.DBF': after['MEDICINE.DBF']!.slice(1) };
    const r1 = reconcile(SOUL, old, lost, m.rejected);
    expect(r1.matches).toBe(false);
    expect(r1.lines.filter((l) => !l.ok).map((l) => `${l.table} ${l.total}`)).toEqual([
      'MEDICINE.DBF records',
      'MEDICINE.DBF sum of PRICE',
      'MEDICINE.DBF sum of QTY',
      'all stock value',
    ]);
    expect(r1.lines[0]).toMatchObject({ before: '40', after: '39', ok: false });
    const changed = {
      ...after,
      'BILLS.DBF': after['BILLS.DBF']!.map((r, i) =>
        i === 0 ? { ...r, values: { ...r.values, TOTAL: '1.00' } } : r,
      ),
    };
    expect(
      reconcile(SOUL, old, changed, m.rejected)
        .lines.filter((l) => !l.ok)
        .map((l) => `${l.table} ${l.total}`),
    ).toEqual(['BILLS.DBF sum of TOTAL']);
    const added = {
      ...after,
      'CUSTOMER.DBF': [...after['CUSTOMER.DBF']!, after['CUSTOMER.DBF']![0]!],
    };
    expect(reconcile(SOUL, old, added, m.rejected).matches).toBe(false);
  });

  it('a rejected record is accounted for: it did not cross, and that matches', () => {
    const old = seed('shifa');
    old['MEDICINE.DBF'] = old['MEDICINE.DBF']!.map((r, i) =>
      i === 1 ? { ...r, values: { ...r.values, EXPIRY: '19990231' } } : r,
    );
    const { m, after } = crossed(SOUL, old);
    expect(m.rejected).toHaveLength(1);
    const r = reconcile(SOUL, old, after, m.rejected);
    expect(r.matches).toBe(true);
    expect(r.lines[0]).toMatchObject({
      table: 'MEDICINE.DBF',
      before: '40',
      rejected: '1',
      after: '39',
    });
  });

  it('any one record lost, doubled or changed is caught, in its table (property)', () => {
    const old = seed('shifa');
    const { m, after } = crossed(SOUL, old);
    const files = Object.keys(after).filter((f) => after[f]!.length);
    fc.assert(
      fc.property(
        fc.constantFrom(...files),
        fc.nat(),
        fc.constantFrom('lose', 'double', 'change'),
        fc.integer({ min: 1, max: 999 }),
        (file, at, how, delta) => {
          const rows = after[file]!;
          const i = at % rows.length;
          const entity = SOUL.entities.find((e) => e.file === file)!;
          const n = entity.fields.find((f) => f.type === 'N');
          let broken: DbfRecord[];
          if (how === 'lose') broken = rows.filter((_, j) => j !== i);
          else if (how === 'double') broken = [...rows, rows[i]!];
          else {
            if (!n) return;
            broken = rows.map((r, j) =>
              j === i
                ? {
                    ...r,
                    values: {
                      ...r.values,
                      [n.name]: (Number(r.values[n.name] ?? 0) + delta).toFixed(n.decimals),
                    },
                  }
                : r,
            );
          }
          const r = reconcile(SOUL, old, { ...after, [file]: broken }, m.rejected);
          expect(r.matches).toBe(false);
          expect(r.lines.some((l) => !l.ok && l.table === file)).toBe(true);
        },
      ),
    );
  });
});
