// What changed between two Soul versions (Prompt 45), by id: rules, entities, screens and actions
// added, removed or changed (and which fields of each), plus the version's own header. Applying
// the diff to the version before gives the new version exactly.
import type { Action, Entity, Rule, Screen, Soul } from './ir';

type Item = { id: string };
export type FieldChange = { field: string; before: unknown; after: unknown };
export type CollectionDiff<T extends Item> = {
  added: T[];
  removed: string[];
  /** The new item, and which of its fields changed. */
  changed: { id: string; item: T; fields: FieldChange[] }[];
  /** The ids in the new version's order. */
  order: string[];
};

export type SoulDiff = {
  from: number;
  to: number;
  header: Pick<Soul, 'schemaVersion' | 'app' | 'version' | 'provenance'>;
  rules: CollectionDiff<Rule>;
  entities: CollectionDiff<Entity>;
  screens: CollectionDiff<Screen>;
  actions: CollectionDiff<Action>;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diffList<T extends Item>(a: T[], b: T[]): CollectionDiff<T> {
  const before = new Map(a.map((x) => [x.id, x]));
  const after = new Set(b.map((x) => x.id));
  const changed: CollectionDiff<T>['changed'] = [];
  for (const item of b) {
    const old = before.get(item.id);
    if (!old || same(old, item)) continue;
    const keys = [...new Set([...Object.keys(item), ...Object.keys(old)])];
    const fields = keys
      .filter(
        (k) => !same((old as Record<string, unknown>)[k], (item as Record<string, unknown>)[k]),
      )
      .map((field) => ({
        field,
        before: (old as Record<string, unknown>)[field],
        after: (item as Record<string, unknown>)[field],
      }));
    changed.push({ id: item.id, item, fields });
  }
  return {
    added: b.filter((x) => !before.has(x.id)),
    removed: a.filter((x) => !after.has(x.id)).map((x) => x.id),
    changed,
    order: b.map((x) => x.id),
  };
}

export function diffSouls(a: Soul, b: Soul): SoulDiff {
  return {
    from: a.version,
    to: b.version,
    header: {
      schemaVersion: b.schemaVersion,
      app: b.app,
      version: b.version,
      provenance: b.provenance,
    },
    rules: diffList(a.rules, b.rules),
    entities: diffList(a.entities, b.entities),
    screens: diffList(a.screens, b.screens),
    actions: diffList(a.actions, b.actions),
  };
}

function applyList<T extends Item>(a: T[], d: CollectionDiff<T>): T[] {
  const items = new Map(a.filter((x) => !d.removed.includes(x.id)).map((x) => [x.id, x]));
  for (const x of d.added) items.set(x.id, x);
  for (const c of d.changed) items.set(c.id, c.item);
  return d.order.map((id) => {
    const x = items.get(id);
    if (!x) throw new Error(`The diff names ${id}, which is in neither version`);
    return x;
  });
}

/** The version `d` leads to, from the version it was made from. */
export function applySoulDiff(a: Soul, d: SoulDiff): Soul {
  if (a.version !== d.from)
    throw new Error(`This diff applies to version ${d.from}, not ${a.version}`);
  return {
    ...d.header,
    entities: applyList(a.entities, d.entities),
    screens: applyList(a.screens, d.screens),
    actions: applyList(a.actions, d.actions),
    rules: applyList(a.rules, d.rules),
  };
}

const count = (c: CollectionDiff<Item>) => c.added.length + c.removed.length + c.changed.length;

/** How much changed: rules in detail, the rest as one count each. */
export function summarizeDiff(d: SoulDiff) {
  return {
    added: d.rules.added.length,
    removed: d.rules.removed.length,
    changed: d.rules.changed.length,
    entities: count(d.entities),
    screens: count(d.screens),
    actions: count(d.actions),
  };
}
