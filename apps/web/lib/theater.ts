// The Possession Theater (Prompt 51): what the page draws from the Possessor's live observation
// events. Pure, so it is tested here and the component only draws it.
import type { DbfField, DbfValue, SnapshotDiff, Table, TableDiff } from '@afterlife/dbf';
import { z } from 'zod';
import type { LiveEvent } from './live';

const TheaterObservationSchema = z.object({
  step: z.number().int().positive(),
  label: z.string(),
  keys: z.string(),
  kind: z.enum(['explore', 'walk', 'back', 'guide']).default('explore'),
  from: z.string(),
  to: z.string(),
  /** The screens before and after, by layout fingerprint. */
  fromFingerprint: z.string().optional(),
  fingerprint: z.string().optional(),
  changed: z.array(z.string()),
  errors: z.array(z.string()),
  /** The stored observation, for its data diff. */
  id: z.string().optional(),
  /** The data diff, sent with an action that changed data (a recorded run has no stored row). */
  diff: z.custom<SnapshotDiff>((v) => !!v && typeof v === 'object' && 'tables' in v).optional(),
});
export type TheaterObservation = z.infer<typeof TheaterObservationSchema>;

/** The newest possession's observations, oldest first (a re-run starts again at step 1). */
export function theaterObservations(events: LiveEvent[]): TheaterObservation[] {
  const out: TheaterObservation[] = [];
  for (const e of events) {
    if (e.type !== 'observation') continue;
    const p = TheaterObservationSchema.safeParse(e.payload);
    if (!p.success) continue;
    if (p.data.step === 1) out.length = 0;
    out.push(p.data);
  }
  return out;
}

/** A screen, with how many states of it were seen (NEW BILL with a line added is a state). */
export type GraphNode = {
  id: string;
  title: string;
  order: number;
  current: boolean;
  states: number;
};
export type GraphEdge = { id: string; source: string; target: string; label: string };

const NO_TITLE = '(no title)';

/**
 * The screen graph so far (review of 51-60, finding 6): one node per screen title, in the order
 * found, with the states seen of it (its fingerprints); the one the Possessor is on now current;
 * the keys that led from one screen to another as edges (a move within a screen is not one).
 */
export function theaterGraph(events: LiveEvent[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode & { prints: Set<string> }>();
  const edges = new Map<string, GraphEdge>();
  const node = (fingerprint: string, title: string) => {
    const name = title.trim() || NO_TITLE;
    const id = `screen:${name}`;
    const n = nodes.get(id) ?? {
      id,
      title: name,
      order: nodes.size,
      current: false,
      states: 0,
      prints: new Set<string>(),
    };
    n.prints.add(fingerprint);
    n.states = n.prints.size;
    nodes.set(id, n);
    return id;
  };
  let current: string | null = null;
  for (const o of theaterObservations(events)) {
    if (!o.fromFingerprint || !o.fingerprint) continue;
    const from = node(o.fromFingerprint, o.from);
    const to = node(o.fingerprint, o.to);
    current = to;
    if (from === to) continue;
    const id = `${from}->${to}`;
    if (!edges.has(id)) edges.set(id, { id, source: from, target: to, label: o.keys });
  }
  return {
    nodes: [...nodes.values()].map((n) => ({
      id: n.id,
      title: n.title,
      order: n.order,
      states: n.states,
      current: n.id === current,
    })),
    edges: [...edges.values()],
  };
}

/** What the Possessor is doing, in one plain line. */
export function thought(o: TheaterObservation): string {
  const fill = /^(.*?) = (.*?)(?: \(([a-z-]+)\))?$/.exec(o.label);
  const hint = /^(.+?)=(.+)$/.exec(o.label);
  let line: string;
  if (o.kind === 'guide') line = `Following the owner's séance: ${o.keys}, to ${o.to}.`;
  else if (o.kind === 'back') line = `Going back from ${o.from} with ${o.label}.`;
  else if (o.kind === 'walk') line = `Walking back to ${o.to}, where there is more to try.`;
  else if (fill)
    line = fill[3]
      ? `Trying ${fill[2]} in ${fill[1]} on ${o.from}, a boundary value (${fill[3]}).`
      : `Typing ${fill[2]} into ${fill[1]} on ${o.from}.`;
  else if (hint) line = `Pressing ${hint[1]} to "${hint[2]}" on ${o.from}.`;
  else {
    const menu = /^\S+ (.+)$/.exec(o.label);
    line = menu ? `Opening "${menu[1]}" from ${o.from}.` : `Pressing ${o.keys} on ${o.from}.`;
  }
  if (o.changed.length) line += ` Data changed: ${o.changed.join(', ')}.`;
  if (o.errors.length) line += ` The app said: ${o.errors.join('; ')}.`;
  return line;
}

export type DiffCard = { caption: string; before: Table; after: Table; diff: TableDiff };

/**
 * The diff keeps values, not the schema, so a field's type is guessed from them: decimals and short
 * whole numbers are numbers; long digit strings and ones with a leading zero are codes and phones.
 */
const isNumber = (v: DbfValue) =>
  typeof v === 'string' && (/^-?\d+\.\d+$/.test(v) || /^-?(0|[1-9]\d{0,5})$/.test(v));

/**
 * A DbfDiffView card per changed table, with only the records that changed: an observation keeps
 * the diff, not the whole tables. Updated records show their key and the fields that changed.
 */
export function diffCards(diff: SnapshotDiff): DiffCard[] {
  return Object.entries(diff.tables).flatMap(([caption, t]) => {
    if (!t.inserted.length && !t.deleted.length && !t.updated.length) return [];
    const withKey = (key: string | null, v: Record<string, DbfValue>) =>
      t.key && key !== null ? { [t.key]: key, ...v } : v;
    const updBefore = t.updated.map((u) =>
      withKey(u.key, Object.fromEntries(u.changes.map((c) => [c.field, c.before]))),
    );
    const updAfter = t.updated.map((u) =>
      withKey(u.key, Object.fromEntries(u.changes.map((c) => [c.field, c.after]))),
    );
    const beforeValues = [...updBefore, ...t.deleted.map((d) => d.values)];
    const afterValues = [...updAfter, ...t.inserted.map((d) => d.values)];
    const all = [...beforeValues, ...afterValues];
    const names = [...new Set(all.flatMap((v) => Object.keys(v)))];
    if (t.key) names.sort((a, b) => (a === t.key ? -1 : b === t.key ? 1 : 0));
    const fields: DbfField[] = names.map((name) => {
      const vals = all.map((v) => v[name]).filter((v) => v !== undefined && v !== null);
      const numeric = vals.length > 0 && vals.every(isNumber);
      const length = Math.max(1, ...vals.map((v) => String(v).length));
      const decimals = numeric
        ? Math.max(0, ...vals.map((v) => String(v).split('.')[1]?.length ?? 0))
        : 0;
      return { name, type: numeric ? 'N' : 'C', length, decimals };
    });
    const table = (rows: Record<string, DbfValue>[]): Table => ({
      fields,
      records: rows.map((values) => ({ deleted: false, values })),
    });
    const n = t.updated.length;
    return [
      {
        caption,
        before: table(beforeValues),
        after: table(afterValues),
        diff: {
          ...t,
          // Renumbered to where each record is in these small tables.
          inserted: t.inserted.map((d, i) => ({ ...d, recno: n + i })),
          deleted: t.deleted.map((d, i) => ({ ...d, recno: n + i })),
          updated: t.updated.map((u, i) => ({ ...u, beforeRecno: i, afterRecno: i })),
        },
      },
    ];
  });
}
