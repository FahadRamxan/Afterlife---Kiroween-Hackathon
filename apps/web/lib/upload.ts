import { dbfPreviewBytes, type InspectedTable } from '@afterlife/dbf';
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

/** One DBF of the preview: its table, or why it could not be read. `file` is its path in the zip. */
export type InspectedFile =
  | (InspectedTable & { file: string; ok: true })
  | { file: string; ok: false; code: string; message: string };

/** `message: null` means the API could not be reached. */
export type InspectResult =
  { ok: true; files: InspectedFile[]; leftOut: number } | { ok: false; message: string | null };

/** The API takes at most this many files at once; a bigger folder previews its first ones. */
export const MAX_PREVIEW_FILES = 50;
/** Records per table in the preview. */
const PREVIEW_ROWS = 100;

const fileName = (path: string) => path.split('/').pop() ?? path;

/**
 * Sends the DBF files to POST /api/dbf/inspect: at most the first 50, each cut to its header and
 * first 100 records (years of bill lines are megabytes, and the preview shows 100). Never throws.
 */
export async function postInspect(
  base: string,
  dbfs: DbfUpload[],
  fetcher: typeof fetch = fetch,
): Promise<InspectResult> {
  const sent = dbfs.slice(0, MAX_PREVIEW_FILES);
  const form = new FormData();
  form.append('cut', String(PREVIEW_ROWS));
  for (const d of sent)
    form.append(
      'files',
      new Blob([dbfPreviewBytes(d.bytes, PREVIEW_ROWS) as BlobPart]),
      fileName(d.name),
    );
  try {
    const res = await fetcher(inspectUrl(base)!, { method: 'POST', body: form });
    const body = (await res.json()) as { files?: InspectedFile[]; message?: string };
    // The API keeps only the file name and answers in the order the files were sent, so each
    // file gets back its path in the zip: DATA/MEDICINE.DBF and BACKUP/MEDICINE.DBF stay apart.
    if (res.ok && body.files)
      return {
        ok: true,
        files: body.files.map((t, i) => ({ ...t, file: sent[i]?.name ?? t.file })),
        leftOut: dbfs.length - sent.length,
      };
    return { ok: false, message: body.message ?? `The API answered ${res.status}` };
  } catch {
    return { ok: false, message: null };
  }
}
