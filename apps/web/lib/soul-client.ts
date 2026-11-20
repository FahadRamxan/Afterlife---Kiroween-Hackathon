// The Soul tab (Prompt 44): the project's Soul from the API, its Kiro spec as a zip, and the
// evidence (observations) its rules point at.
import type { SnapshotDiff } from '@afterlife/dbf';
import { gridFromCells, unicodeToCp437, type ScreenGrid } from '@afterlife/screen';
import { SoulSchema, writeKiroSpec, type Soul } from '@afterlife/soul';
import { strToU8, zipSync } from 'fflate';

const base = (api: string) => api.replace(/\/+$/, '');

export type SoulAnswer =
  | { ok: true; version: number; soul: Soul }
  | { ok: false; reason: 'none' | 'unconfigured' | 'down' }
  | { ok: false; reason: 'error'; message: string };

export async function getSoul(
  api: string | undefined,
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<SoulAnswer> {
  if (!api) return { ok: false, reason: 'unconfigured' };
  try {
    const res = await fetcher(`${base(api)}/api/projects/${encodeURIComponent(projectId)}/soul`, {
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      version?: number;
      soul?: unknown;
    };
    if (res.status === 404 && body.error === 'NO_SOUL') return { ok: false, reason: 'none' };
    if (!res.ok)
      return {
        ok: false,
        reason: 'error',
        message: body.message ?? `The API answered ${res.status}`,
      };
    const soul = SoulSchema.safeParse(body.soul);
    return soul.success && typeof body.version === 'number'
      ? { ok: true, version: body.version, soul: soul.data }
      : { ok: false, reason: 'error', message: 'The API answer was not a Soul' };
  } catch {
    return { ok: false, reason: 'down' };
  }
}

export type Observation = {
  id: string;
  keys: string;
  screenBefore: { text: string[]; model?: { title?: { name?: string } } };
  screenAfter: { text: string[]; model?: { title?: { name?: string } } };
  dbfDiff: Diff;
};

export async function getObservation(
  api: string,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<Observation | null> {
  try {
    const res = await fetcher(`${base(api)}/api/observations/${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as Observation) : null;
  } catch {
    return null;
  }
}

/** How many observations the project has (its own and its séances'), or null when unknown. */
export async function getObservationCount(
  api: string,
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const res = await fetcher(
      `${base(api)}/api/projects/${encodeURIComponent(projectId)}/observations`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const total = ((await res.json()) as { total?: unknown }).total;
    return typeof total === 'number' && Number.isInteger(total) && total >= 0 ? total : null;
  } catch {
    return null;
  }
}
/** The Kiro spec of a Soul as a zip: one folder, ready to open in Kiro. */
export function specZip(soul: Soul): Uint8Array {
  const root = `${soul.app.id}-kiro-spec`;
  return zipSync(
    Object.fromEntries(
      Object.entries(writeKiroSpec(soul)).map(([path, text]) => [`${root}/${path}`, strToU8(text)]),
    ),
  );
}

/** The screen as the decoder read it, for CrtScreen. Its colours are not kept: white on black. */
export function textGrid(text: string[]): ScreenGrid {
  const rows = text.length === 50 ? 50 : 25;
  return gridFromCells(
    Array.from({ length: rows }, (_, r) => {
      const codes = unicodeToCp437((text[r] ?? '').padEnd(80).slice(0, 80));
      return Array.from({ length: 80 }, (_, c) => ({ code: codes[c] ?? 0x20, fg: 7, bg: 0 }));
    }),
  );
}

type Diff = SnapshotDiff;
type Value = string | number | boolean | null;

export type DiffRow = {
  table: string;
  kind: 'inserted' | 'deleted' | 'changed';
  key: string;
  detail: string;
};

/** Each changed record of a data diff, for the evidence view. */
export function diffRows(diff: Diff): DiffRow[] {
  const values = (v: Record<string, Value>) =>
    Object.entries(v)
      .map(([k, x]) => `${k} ${String(x ?? '')}`.trim())
      .join(', ');
  return Object.entries(diff.tables).flatMap(([table, t]) => [
    ...t.inserted.map((r) => ({
      table,
      kind: 'inserted' as const,
      key: r.key ?? '',
      detail: values(r.values),
    })),
    ...t.deleted.map((r) => ({
      table,
      kind: 'deleted' as const,
      key: r.key ?? '',
      detail: values(r.values),
    })),
    ...t.updated.map((r) => ({
      table,
      kind: 'changed' as const,
      key: r.key ?? '',
      detail: r.changes
        .map((c) => `${c.field} ${String(c.before ?? '')} → ${String(c.after ?? '')}`)
        .join(', '),
    })),
  ]);
}
