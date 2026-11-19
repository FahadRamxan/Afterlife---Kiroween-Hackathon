// Soul versions (Prompt 45): the list, and the comparison of two of them, from the API.
import type { SoulDiff } from '@afterlife/soul';

export type VersionRow = {
  version: number;
  createdAt: string;
  createdBy: string;
  rules: number;
  changes: {
    added: number;
    removed: number;
    changed: number;
    entities: number;
    screens: number;
    actions: number;
  } | null;
};

const base = (api: string) => api.replace(/\/+$/, '');

export async function listVersions(
  api: string,
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<VersionRow[] | null> {
  try {
    const res = await fetcher(`${base(api)}/api/projects/${encodeURIComponent(projectId)}/souls`, {
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as { versions: VersionRow[] }).versions : null;
  } catch {
    return null;
  }
}

export async function compareVersions(
  api: string,
  projectId: string,
  from: number,
  to: number,
  fetcher: typeof fetch = fetch,
): Promise<SoulDiff | null> {
  try {
    const res = await fetcher(
      `${base(api)}/api/projects/${encodeURIComponent(projectId)}/souls/compare?from=${from}&to=${to}`,
      { cache: 'no-store' },
    );
    return res.ok ? ((await res.json()) as { diff: SoulDiff }).diff : null;
  } catch {
    return null;
  }
}

/** A short line for a version: "1 rule added, 2 changed". Empty when nothing changed. */
export function changeLine(c: NonNullable<VersionRow['changes']>): string[] {
  const parts: string[] = [];
  if (c.added) parts.push(`${c.added} added`);
  if (c.removed) parts.push(`${c.removed} removed`);
  if (c.changed) parts.push(`${c.changed} changed`);
  return parts;
}

/** A field value for the comparison view: text as is, anything else as JSON. */
export const showValue = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
