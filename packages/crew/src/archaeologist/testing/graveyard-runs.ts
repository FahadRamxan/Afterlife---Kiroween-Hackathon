// Test data: what the sample apps really did in DOSBox. Each scripted scenario in
// samples/graveyard/<app>/scenarios was run in the real app (`pnpm graveyard:test`), and its data
// files are kept as CSV in samples/graveyard/fixtures/<app>. Diffing them against the seed data
// gives the observation the Possessor would have made for that scenario.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { diffTables, type DbfField, type DbfValue, type SnapshotDiff } from '@afterlife/dbf';
import type { Entity } from '@afterlife/soul';
import type { EffectObservation } from '../hypotheses';
import type { HiddenRule, ScoreEvidence } from '../scoring';
import type { VerifyEntity } from '../verify';

const ROOT = new URL('../../../../../samples/graveyard/', import.meta.url);

type Csv = {
  fields: DbfField[];
  records: { deleted: boolean; values: Record<string, DbfValue> }[];
};

/** Our CSV format: "#" comments, a NAME:TYPE:LEN[:DEC] header (maybe a _DEL column), then rows. */
export function readCsv(path: string): Csv {
  const lines = readFileSync(new URL(path, ROOT), 'latin1')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l !== '' && !l.startsWith('#'));
  const cols = lines[0]!.split(',').map((h) => {
    const [name, type, len, dec] = h.split(':');
    return {
      name: name!,
      type: type as DbfField['type'],
      length: Number(len),
      decimals: Number(dec ?? 0),
    };
  });
  const hasDel = cols[0]?.name === '_DEL';
  const fields = hasDel ? cols.slice(1) : cols;
  const records = lines.slice(1).map((line) => {
    const cells = line.split(',');
    const flag = hasDel ? cells.shift() : '';
    return {
      deleted: flag === '*',
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

/** The data files of an app (from its seed folder), upper case without .DBF: BILLS, MEDICINE. */
export function graveyardTables(app: string): string[] {
  return readdirSync(new URL(`${app}/seed/`, ROOT))
    .filter((f) => f.endsWith('.csv'))
    .map((f) => f.replace(/\.csv$/, ''))
    .sort();
}

/** The scenarios of an app with a fixture folder. */
export function graveyardScenarios(app: string): string[] {
  const dir = new URL(`fixtures/${app}/`, ROOT);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

/**
 * The observation of one scenario: the seed data before, the scenario's data after, records
 * matched by `keys` (by table, null for record numbers).
 */
export function graveyardRun(
  app: string,
  scenario: string,
  keys: Record<string, string | null>,
): EffectObservation {
  const tables: SnapshotDiff['tables'] = {};
  for (const f of graveyardTables(app)) {
    const after = `fixtures/${app}/${scenario}/${f}.csv`;
    if (!existsSync(new URL(after, ROOT))) continue;
    const d = diffTables(readCsv(`${app}/seed/${f}.csv`), readCsv(after), {
      key: keys[f] ?? null,
    });
    if (d.inserted.length || d.updated.length || d.deleted.length) tables[`${f}.DBF`] = d;
  }
  const keysFile = new URL(`${app}/scenarios/${scenario}.keys`, ROOT);
  return {
    id: scenario,
    keys: existsSync(keysFile) ? readFileSync(keysFile, 'latin1') : '',
    screenBefore: {},
    dbfDiff: { tables, unchanged: [], addedTables: [], removedTables: [] },
  };
}

const SHIFA_KEYS = { BILLS: 'BILL_NO', BILLITEM: null, MEDICINE: 'CODE', CUSTOMER: 'CUST_ID' };

/** Shifa's observation of one scenario (its id is the scenario's name). */
export function shifaRun(scenario: string): EffectObservation {
  return graveyardRun('shifa', scenario, SHIFA_KEYS);
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

/** An app's hidden rules, with their truth, from its manifest. */
export function graveyardHidden(app: string): HiddenRule[] {
  const m = JSON.parse(readFileSync(new URL(`${app}/manifest.json`, ROOT), 'utf8')) as {
    knownRules: HiddenRule[];
  };
  return m.knownRules.map(({ id, text, scenarios, truth }) => ({ id, text, scenarios, truth }));
}

/** Every scripted scenario of an app as an observation, records matched by the entities' keys. */
export function graveyardEvidence(app: string, entities: VerifyEntity[]): ScoreEvidence {
  const keys: Record<string, string | null> = {};
  for (const e of entities) keys[e.file.replace(/\.DBF$/i, '').toUpperCase()] = e.key?.[0] ?? null;
  return {
    observations: graveyardScenarios(app).map((s) => graveyardRun(app, s, keys)),
    entities,
  };
}

/** An app's entities with their fields (from the seed CSVs), ids as the Soul names them. */
export function graveyardEntities(
  app: string,
  ids: Record<string, string>,
  keys: Record<string, string[]>,
): Entity[] {
  return graveyardTables(app).map(
    (f) =>
      ({
        id: ids[f]!,
        name: ids[f]!,
        file: `${f}.DBF`,
        fields: readCsv(`${app}/seed/${f}.csv`).fields,
        key: keys[f] ?? [],
        foreignKeys: [],
        counters: [],
      }) as Entity,
  );
}
