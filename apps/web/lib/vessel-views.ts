// The reborn app's screens (Prompt 59), from the Soul: the old main menu becomes the navigation,
// a screen where an action starts becomes its form, and a screen whose fields show an entity's
// records becomes a list of them. Plus the small formatting the screens share.
import type { DbfField, DbfRecord, DbfValue } from '@afterlife/dbf';
import type { Entity, Soul } from '@afterlife/soul';

export type VesselView =
  | { id: string; title: string; kind: 'action'; actionId: string }
  | {
      id: string;
      title: string;
      kind: 'table';
      entity: Entity;
      fields: string[];
      /** An action that adds a record to this list (the old CUSTOMERS screen's "A=Add"). */
      addActionId?: string;
    };

/** The entities whose records only exist inside another's (a bill's lines). */
function lineEntities(soul: Soul): Set<string> {
  const out = new Set<string>();
  for (const a of soul.actions) {
    const inserts = a.effects.filter((e) => e.kind === 'insert').map((e) => e.entity);
    for (const id of inserts) {
      const e = soul.entities.find((x) => x.id === id);
      if (e?.foreignKeys.some((fk) => inserts.includes(fk.references.entity))) out.add(id);
    }
  }
  return out;
}

/** An action with no lines that writes one record of `entity`: adding to its list. */
const adds = (soul: Soul, entity: string) =>
  soul.actions.find(
    (a) =>
      a.effects.filter((e) => e.kind === 'insert').length === 1 &&
      a.effects.some((e) => e.kind === 'insert' && e.entity === entity),
  );

function viewFor(soul: Soul, screenId: string): VesselView | null {
  const screen = soul.screens.find((s) => s.id === screenId);
  if (!screen) return null;
  const bound = screen.fields.filter((f) => f.binds);
  const action = soul.actions.find((a) => a.screen === screenId);
  // A screen where an action starts is its form, unless it is a list the action adds to.
  if (action && !(bound.length && adds(soul, bound[0]!.binds!.entity) === action))
    return { id: screenId, title: screen.title, kind: 'action', actionId: action.id };
  const counts = new Map<string, number>();
  for (const f of bound) counts.set(f.binds!.entity, (counts.get(f.binds!.entity) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const entity = soul.entities.find((e) => e.id === top);
  if (!entity) return null;
  return {
    id: screenId,
    title: screen.title,
    kind: 'table',
    entity,
    fields: bound.filter((f) => f.binds!.entity === entity.id).map((f) => f.binds!.field),
    ...(adds(soul, entity.id) ? { addActionId: adds(soul, entity.id)!.id } : {}),
  };
}

export function vesselViews(soul: Soul): VesselView[] {
  // The menu: the screen that leads to the most others.
  const root = [...soul.screens].sort((a, b) => b.navigation.length - a.navigation.length)[0];
  const views = (root?.navigation ?? [])
    .map((n) => viewFor(soul, n.to))
    .filter((v): v is VesselView => v !== null);
  if (views.length) return views;
  // No menu was found: each action, then a list of each entity that stands on its own.
  const lines = lineEntities(soul);
  const tables = soul.entities.filter((e) => !lines.has(e.id));
  const listed = new Set(tables.map((e) => adds(soul, e.id)?.id));
  return [
    ...soul.actions
      .filter((a) => !listed.has(a.id))
      .map((a) => ({ id: a.id, title: a.name, kind: 'action' as const, actionId: a.id })),
    ...tables.map((e) => ({
      id: e.id,
      title: e.name,
      kind: 'table' as const,
      entity: e,
      fields: e.fields.map((f) => f.name),
      ...(adds(soul, e.id) ? { addActionId: adds(soul, e.id)!.id } : {}),
    })),
  ];
}

/** Money with thousands grouped, the paisa exactly as stored (no floats). */
export function money(v: DbfValue | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(s);
  if (!m) return s;
  return `${m[1]}${m[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${m[3] ?? ''}`;
}

/** A stored value as the owner reads it: dates DD/MM/YYYY, numbers grouped. */
export function displayValue(field: DbfField, v: DbfValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (field.type === 'D' && /^\d{8}$/.test(String(v))) {
    const s = String(v);
    return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  }
  if (field.type === 'N' || field.type === 'F') return money(v);
  if (field.type === 'L') return v ? 'Y' : 'N';
  return String(v);
}

/**
 * Live records holding the query in one of `fields`, best first: a field that starts with it
 * (a code), then one that has a word starting with it, then any that contains it.
 */
export function searchRecords(
  records: DbfRecord[],
  query: string,
  fields: string[],
  limit = 8,
): DbfRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (r: DbfRecord) => {
    const vals = fields.map((f) => String(r.values[f] ?? '').toLowerCase());
    if (vals.some((v) => v.startsWith(q))) return 0;
    if (vals.some((v) => v.split(/\s+/).some((w) => w.startsWith(q)))) return 1;
    if (vals.some((v) => v.includes(q))) return 2;
    return -1;
  };
  return records
    .filter((r) => !r.deleted)
    .map((r) => ({ r, k: rank(r) }))
    .filter((x) => x.k >= 0)
    .sort((a, b) => a.k - b.k)
    .slice(0, limit)
    .map((x) => x.r);
}

/** The key of a word in the Vessel's translations: "NEW BILL" is new_bill. */
export const wordKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/**
 * The reborn app's page title (review of 51-60, finding 7): "Reborn app · Afterlife", and once
 * its Soul is open "Shifa Medical Store · Reborn app · Afterlife".
 */
export function vesselTitle(label: string, appName?: string | null): string {
  return [appName?.trim(), label, 'Afterlife'].filter(Boolean).join(' · ');
}
