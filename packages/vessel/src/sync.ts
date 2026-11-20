// Offline sales and syncing them (Prompt 60). On the phone, every action that is saved also goes
// into an outbox. Back online, the outbox is sent in order and the server replays each sale with
// the same runtime on its own records. The policy:
// - the sale stands: it already happened in the shop, so the server does not check the rules again
//   (it still refuses a code it does not know);
// - for a value the sale changes (the stock), the last write wins: the effect rule runs on the
//   server's value, so a sale from another phone is not lost;
// - when the value the phone started from is not the server's (another phone sold the same
//   medicine), the change is a stock conflict and goes on the owner's review list.
// The server also gives out the numbers (bill 9807-0002 when another phone took 0001).
import type { DbfValue, SnapshotDiff } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { createVessel, type ActionInputs, type Vessel } from './runtime';
import type { EntityStore } from './store';

/** One saved action waiting to reach the server. */
export type SyncItem = {
  /** A UUID made on the phone: the server applies each one once. */
  id: string;
  actionId: string;
  inputs: ActionInputs;
  /** The phone's date when it was saved (YYYY-MM-DD): the bill's date. */
  today: string;
  /** When it was saved (ISO time). */
  at: string;
  /** What it did on the phone, and the record it wrote there. */
  effects: SnapshotDiff;
  record: Record<string, DbfValue>;
};

export interface Outbox {
  add(item: SyncItem): Promise<void>;
  /** Oldest first. */
  pending(): Promise<SyncItem[]>;
  remove(ids: string[]): Promise<void>;
}

export class MemoryOutbox implements Outbox {
  private items: SyncItem[] = [];
  async add(item: SyncItem) {
    this.items.push(structuredClone(item));
  }
  async pending() {
    return structuredClone(this.items);
  }
  async remove(ids: string[]) {
    this.items = this.items.filter((i) => !ids.includes(i.id));
  }
}

/** A value the phone and the server saw differently: for the owner to review. */
export type StockConflict = {
  file: string;
  /** The record (INS100), or #recno when the file has no one-field key. */
  key: string;
  field: string;
  phone: { before: DbfValue; after: DbfValue };
  server: { before: DbfValue; after: DbfValue } | null;
};

export type SyncResult = {
  id: string;
  ok: boolean;
  /** Why the server could not take it (a code it does not know). */
  message?: string;
  /** The record's key on the phone and on the server, when they differ (a bill renumbered). */
  renumbered?: { phone: string; server: string };
  conflicts: StockConflict[];
};

const recordId = (key: string | null, recno: number) => key ?? `#${recno}`;

/** The changed numbers the phone started from a different value for than the server did. */
export function stockConflicts(phone: SnapshotDiff, server: SnapshotDiff): StockConflict[] {
  const out: StockConflict[] = [];
  for (const [file, d] of Object.entries(phone.tables))
    for (const u of d.updated) {
      const id = recordId(u.key, u.beforeRecno);
      const theirs = server.tables[file]?.updated.find(
        (x) => recordId(x.key, x.beforeRecno) === id,
      );
      for (const c of u.changes) {
        // Numbers only (a delta is given for N and F fields): a stock, a balance.
        if (!('delta' in c)) continue;
        const s = theirs?.changes.find((x) => x.field === c.field);
        if (s && s.before === c.before && s.after === c.after) continue;
        out.push({
          file,
          key: id,
          field: c.field,
          phone: { before: c.before, after: c.after },
          server: s ? { before: s.before, after: s.after } : null,
        });
      }
    }
  return out;
}

/** The server's side: replays one sale on its records, with the sale's own date. */
export async function replaySale(
  soul: Soul,
  store: EntityStore,
  item: SyncItem,
): Promise<SyncResult> {
  const v = createVessel(soul, store, { today: () => item.today });
  const r = await v.performAction(item.actionId, item.inputs, { validate: false });
  if (!r.ok)
    return {
      id: item.id,
      ok: false,
      message: r.refused.map((x) => x.message).join(' '),
      conflicts: [],
    };
  const header = soul.actions
    .find((a) => a.id === item.actionId)!
    .effects.find((e) => e.kind === 'insert');
  const entity = soul.entities.find((e) => e.id === header?.entity);
  const key = entity?.key.length === 1 ? entity.key[0]! : null;
  const phoneKey = key ? String(item.record[key] ?? '') : '';
  const serverKey = key ? String(r.record[key] ?? '') : '';
  return {
    id: item.id,
    ok: true,
    ...(phoneKey !== serverKey ? { renumbered: { phone: phoneKey, server: serverKey } } : {}),
    conflicts: stockConflicts(item.effects, r.effects),
  };
}

/**
 * The phone's Vessel: the same, and each saved action also goes into the outbox. `newId` makes
 * the item's UUID; `now` the time it was saved.
 */
export function queuedVessel(
  vessel: Vessel,
  outbox: Outbox,
  opts: { today: () => string; newId: () => string; now?: () => string },
): Vessel {
  return {
    ...vessel,
    async performAction(actionId, inputs = {}, o) {
      const r = await vessel.performAction(actionId, inputs, o);
      if (r.ok)
        await outbox.add({
          id: opts.newId(),
          actionId,
          inputs,
          today: opts.today().slice(0, 10),
          at: (opts.now ?? (() => new Date().toISOString()))(),
          effects: r.effects,
          record: r.record,
        });
      return r;
    },
  };
}

/**
 * Sends the outbox, oldest first, in batches. An item the server answered for (taken, or refused
 * for good) leaves the outbox; when the network fails, the rest stay for the next try.
 */
export async function syncOutbox(
  outbox: Outbox,
  push: (items: SyncItem[]) => Promise<SyncResult[]>,
  batch = 50,
): Promise<{ results: SyncResult[]; left: number }> {
  const results: SyncResult[] = [];
  const all = await outbox.pending();
  for (let i = 0; i < all.length; i += batch) {
    const items = all.slice(i, i + batch);
    let answer: SyncResult[];
    try {
      answer = await push(items);
    } catch {
      break;
    }
    const done = answer.filter((a) => items.some((x) => x.id === a.id));
    await outbox.remove(done.map((a) => a.id));
    results.push(...done);
    if (done.length < items.length) break;
  }
  return { results, left: (await outbox.pending()).length };
}
