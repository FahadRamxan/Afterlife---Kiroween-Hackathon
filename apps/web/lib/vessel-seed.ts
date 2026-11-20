// The Vessel's data in the Soul tab (Prompt 58): the old app's own data files, read out of its
// js-dos bundle, so an action runs on the shop's real records. The Undertaker (Prompt 64) moves
// them for good; this copy lives in memory and starts again when the page does.
import { readDbf, type DbfFile } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { MemoryEntityStore } from '@afterlife/vessel';
import { unzipSync } from 'fflate';

/** The data files of the Soul's entities found in a js-dos bundle (a zip), by DOS name. */
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

/** A store with those records, and the files the Soul names that the bundle does not have. */
export async function seededStore(
  bundle: Uint8Array,
  soul: Soul,
): Promise<{ store: MemoryEntityStore; tables: Record<string, DbfFile>; missing: string[] }> {
  const tables = tablesFromBundle(bundle, soul);
  const store = new MemoryEntityStore();
  for (const [file, t] of Object.entries(tables)) await store.load(file, t.records);
  const missing = soul.entities.map((e) => e.file).filter((f) => !tables[f.toUpperCase()]);
  return { store, tables, missing };
}
