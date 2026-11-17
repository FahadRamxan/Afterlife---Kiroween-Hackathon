import type { InspectedTable } from '@afterlife/dbf';
import { unzipSync } from 'fflate';

/** The inspect API refuses anything larger, so the browser checks first. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type UploadCheck = { ok: true } | { ok: false; reason: 'not-zip' | 'empty' | 'too-big' };

/** First check of a chosen file, before it is even read. */
export function checkUpload(file: { name: string; size: number }): UploadCheck {
  if (!/\.zip$/i.test(file.name)) return { ok: false, reason: 'not-zip' };
  if (file.size < 1) return { ok: false, reason: 'empty' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too-big' };
  return { ok: true };
}

export type DbfUpload = { name: string; bytes: Uint8Array };

export type ZipCheck =
  | { ok: true; entries: string[]; program: string; dbfs: DbfUpload[] }
  | { ok: false; reason: 'not-a-zip' | 'no-program' | 'no-dbf'; entries: string[] };

const isProgram = (name: string) => /\.(exe|com)$/i.test(name);
const isDbf = (name: string) => /\.dbf$/i.test(name);

/**
 * Second check, on the zip's contents: it needs a DOS program (EXE or COM) and at least one DBF.
 * Lists every entry but unpacks only the DBF files. Never throws.
 */
export function inspectZip(bytes: Uint8Array): ZipCheck {
  const entries: string[] = [];
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(bytes, {
      filter: (f) => {
        if (!f.name.endsWith('/')) entries.push(f.name);
        return isDbf(f.name);
      },
    });
  } catch {
    return { ok: false, reason: 'not-a-zip', entries: [] };
  }
  const program = entries.find(isProgram);
  if (!program) return { ok: false, reason: 'no-program', entries };
  const dbfs = entries
    .filter(isDbf)
    .map((name) => ({ name, bytes: unpacked[name]! }))
    .filter((d) => d.bytes);
  if (dbfs.length === 0) return { ok: false, reason: 'no-dbf', entries };
  return { ok: true, entries, program, dbfs };
}

export function inspectUrl(base: string | undefined): string | null {
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/api/dbf/inspect`;
}

export type InspectedFile = InspectedTable & { file: string };

/** `message: null` means the API could not be reached. */
export type InspectResult =
  { ok: true; tables: InspectedFile[] } | { ok: false; message: string | null };

const fileName = (path: string) => path.split('/').pop() ?? path;

/** Sends the DBF files to POST /api/dbf/inspect. Never throws. */
export async function postInspect(
  base: string,
  dbfs: DbfUpload[],
  fetcher: typeof fetch = fetch,
): Promise<InspectResult> {
  const form = new FormData();
  for (const d of dbfs) form.append('files', new Blob([d.bytes as BlobPart]), fileName(d.name));
  try {
    const res = await fetcher(inspectUrl(base)!, { method: 'POST', body: form });
    const body = (await res.json()) as {
      tables?: InspectedFile[];
      file?: string;
      message?: string;
    };
    if (res.ok && body.tables) return { ok: true, tables: body.tables };
    const why = body.message ?? `The API answered ${res.status}`;
    return { ok: false, message: body.file ? `${body.file}: ${why}` : why };
  } catch {
    return { ok: false, message: null };
  }
}
