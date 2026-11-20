// The Vessel's first records: the old app's own data files, read out of its js-dos bundle (a zip).
// The phone and the server both start from them, so a sale replayed on the server meets the same
// stock the phone saw.
import { readDbf, type DbfFile } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { unzipSync } from 'fflate';
import type { EntityStore } from './store';

/** The data files of the Soul's entities found in a bundle, by DOS name (BILLS.DBF). */
export function tablesFromBundle(bundle: Uint8Array, soul: Soul): Record<string, DbfFile> {
  const wanted = new Set(soul.entities.map((e) => e.file.toUpperCase()));
  const out: Record<string, DbfFile> = {};
  for (const [path, bytes] of Object.entries(unzipSync(bundle))) {
    const name = path.split('/').at(-1)!.toUpperCase();
    if (path.startsWith('.jsdos/') || !wanted.has(name)) continue;
    out[name] = readDbf(bytes);
  }
  return out;
}

/** Loads them into a store. Gives the files the Soul names that the bundle does not have. */
export async function seedStore(
  store: EntityStore,
  bundle: Uint8Array,
  soul: Soul,
): Promise<{ tables: Record<string, DbfFile>; missing: string[] }> {
  const tables = tablesFromBundle(bundle, soul);
  for (const [file, t] of Object.entries(tables)) await store.load(file, t.records);
  return {
    tables,
    missing: soul.entities.map((e) => e.file).filter((f) => !tables[f.toUpperCase()]),
  };
}
