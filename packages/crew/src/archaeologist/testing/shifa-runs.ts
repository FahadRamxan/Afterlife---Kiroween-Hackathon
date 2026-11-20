// Test data: what Shifa Medical Store really did in DOSBox. Each scripted scenario in
// samples/graveyard/shifa/scenarios was run in the real app (`pnpm graveyard:test`), and its data
// files are kept as CSV in samples/graveyard/fixtures/shifa. Diffing them against the seed data
// gives the observation the Possessor would have made for that scenario.
import { readFileSync } from 'node:fs';
import { diffTables, type DbfField, type DbfValue, type SnapshotDiff } from '@afterlife/dbf';
import type { Entity } from '@afterlife/soul';
import type { EffectObservation } from '../hypotheses';

const ROOT = new URL('../../../../../samples/graveyard/', import.meta.url);
const FILES = ['BILLS', 'BILLITEM', 'MEDICINE', 'CUSTOMER'] as const;
const KEYS: Record<string, string | null> = {
  BILLS: 'BILL_NO',
  BILLITEM: null,
  MEDICINE: 'CODE',
  CUSTOMER: 'CUST_ID',
};

type Csv = {
  fields: DbfField[];
  records: { deleted: boolean; values: Record<string, DbfValue> }[];
};

function readCsv(path: string): Csv {
  const lines = readFileSync(new URL(path, ROOT), 'latin1')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l !== '' && !l.startsWith('#'));
  const fields = lines[0]!.split(',').map((h) => {
    const [name, type, len, dec] = h.split(':');
    return {
      name: name!,
      type: type as DbfField['type'],
      length: Number(len),
      decimals: Number(dec ?? 0),
    };
  });
  const records = lines.slice(1).map((line) => {
    const cells = line.split(',');
    return {
      deleted: false,
      values: Object.fromEntries(
        fields.map((f, i) => {
          const v = cells[i]!;
          return [f.name, f.type === 'C' ? v : v === '' ? null : v];
        }),
      ),
    };
  });
  return { fields, records };
}

/** The observation of one scenario: the seed data before, the scenario's data after. */
export function shifaRun(scenario: string): EffectObservation {
  const tables: SnapshotDiff['tables'] = {};
  for (const f of FILES) {
    const d = diffTables(
      readCsv(`shifa/seed/${f}.csv`),
      readCsv(`fixtures/shifa/${scenario}/${f}.csv`),
      {
        key: KEYS[f]!,
      },
    );
    if (d.inserted.length || d.updated.length || d.deleted.length) tables[`${f}.DBF`] = d;
  }
  return {
    id: scenario,
    keys: readFileSync(new URL(`shifa/scenarios/${scenario}.keys`, ROOT), 'latin1'),
    screenBefore: {},
    dbfDiff: { tables, unchanged: [], addedTables: [], removedTables: [] },
  };
}

/** Shifa's entities, as Prompt 53 detects them (the fields from the data files). */
export function shifaEntities(): Entity[] {
  const fieldsOf = (f: string) => readCsv(`shifa/seed/${f}.csv`).fields;
  const e = (id: string, name: string, file: string, key: string[], counters: Entity['counters']) =>
    ({
      id,
      name,
      file: `${file}.DBF`,
      fields: fieldsOf(file),
      key,
      foreignKeys: [],
      counters,
    }) as Entity;
  return [
    e('bill', 'Bill', 'BILLS', ['BILL_NO'], [{ field: 'BILL_NO', pattern: 'YYMM-####' }]),
    e('bill-item', 'Bill line', 'BILLITEM', [], []),
    e('medicine', 'Medicine', 'MEDICINE', ['CODE'], []),
    e('customer', 'Customer', 'CUSTOMER', ['CUST_ID'], [{ field: 'CUST_ID', pattern: 'C####' }]),
  ];
}
