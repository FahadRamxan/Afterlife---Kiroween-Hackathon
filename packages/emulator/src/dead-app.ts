// Prompt 40: an uploaded dead app. The zip is checked before anything is unpacked: no entry may
// point outside the bundle (zip-slip), only DOS 8.3 names and allowed file types, size limits that
// hold against a zip bomb, and the program must really be a DOS program. What passes goes into a
// js-dos bundle and only ever runs inside the emulator.
import { unzipSync } from 'fflate';
import { isDosFileName } from './bundle';

export const LIMITS = {
  /** The upload itself (the API's body limit too). */
  maxZipBytes: 20 * 1024 * 1024,
  maxFiles: 200,
  /** All files unpacked, and any one file. */
  maxTotalBytes: 50 * 1024 * 1024,
  maxFileBytes: 20 * 1024 * 1024,
  /** A file that unpacks to more than this many times its packed size is a zip bomb. */
  maxRatio: 200,
};

/**
 * What a 1990s DOS business app ships with: the program and its overlays, dBASE/Clipper/FoxPro
 * tables, memos and indexes, and its plain data and config files. Batch files are left out: the
 * bundle starts the program itself.
 */
export const ALLOWED_EXTENSIONS = [
  'EXE',
  'COM',
  'OVL',
  'OVR',
  'DBF',
  'DBT',
  'FPT',
  'NTX',
  'NDX',
  'MDX',
  'CDX',
  'IDX',
  'MEM',
  'FRM',
  'LBL',
  'DAT',
  'TXT',
  'CFG',
  'INI',
  'MSG',
  'HLP',
] as const;

/** DOS device names: a file called CON.DBF would open the console, not a file. */
const DEVICES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'CLOCK$',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'LPT1',
  'LPT2',
  'LPT3',
]);

export type DeadAppError = {
  ok: false;
  code:
    | 'NOT_A_ZIP'
    | 'ZIP_SLIP'
    | 'TOO_MANY_FILES'
    | 'TOO_BIG'
    | 'FILE_TYPE'
    | 'NOT_DOS_NAME'
    | 'DUPLICATE_NAME'
    | 'NO_PROGRAM'
    | 'WHICH_PROGRAM'
    | 'NO_DBF'
    | 'NOT_DOS';
  message: string;
  /** For WHICH_PROGRAM: the programs to choose from. */
  programs?: string[];
};
export type DeadApp = { ok: true; executable: string; files: Record<string, Uint8Array> };

const fail = (code: DeadAppError['code'], message: string, programs?: string[]): DeadAppError => ({
  ok: false,
  code,
  message,
  ...(programs ? { programs } : {}),
});

/** A safe path inside the zip: relative, no "..", no drive, with / or \ as the separator. */
function pathParts(name: string): string[] | null {
  if (name.includes('\0') || /^[a-zA-Z]:/.test(name) || /^[\\/]/.test(name)) return null;
  const parts = name.split(/[\\/]/).filter((p) => p !== '' && p !== '.');
  return parts.some((p) => p === '..') ? null : parts;
}

const extension = (name: string) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toUpperCase();

/**
 * Is this a program DOS runs? An EXE starts with "MZ" and is not a Windows (PE, NE) program; a
 * 32-bit DOS-extender program (LE, LX) is fine. A COM is raw code of at most 65,280 bytes and is
 * not a Unix or macOS binary or a script.
 */
export function isDosProgram(
  name: string,
  b: Uint8Array,
): { ok: true } | { ok: false; why: string } {
  const head = (n: number) => String.fromCharCode(...b.subarray(0, n));
  if (head(4) === '\x7fELF') return { ok: false, why: 'a Linux (ELF) program' };
  if (
    [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(
      new DataView(b.buffer, b.byteOffset).getUint32(0),
    )
  )
    return { ok: false, why: 'a macOS program' };
  if (head(2) === '#!') return { ok: false, why: 'a script' };
  const mz = head(2) === 'MZ' || head(2) === 'ZM';
  if (extension(name) === 'EXE' || mz) {
    if (!mz) return { ok: false, why: 'not a DOS program (no MZ header)' };
    if (b.length >= 0x40) {
      const at = new DataView(b.buffer, b.byteOffset).getUint32(0x3c, true);
      const sig =
        at > 0 && at + 4 <= b.length ? String.fromCharCode(...b.subarray(at, at + 4)) : '';
      if (sig === 'PE\0\0') return { ok: false, why: 'a Windows program (PE)' };
      if (sig.startsWith('NE')) return { ok: false, why: 'a Windows 3.x program (NE)' };
    }
    return { ok: true };
  }
  if (b.length > 65_280) return { ok: false, why: 'too big for a COM program (64 kB at most)' };
  return { ok: true };
}

export function unpackDeadApp(
  zip: Uint8Array,
  opts: { executable?: string } = {},
): DeadApp | DeadAppError {
  if (zip.length > LIMITS.maxZipBytes) return fail('TOO_BIG', 'The zip is over 20 MB');
  // First pass: names and declared sizes only, nothing unpacked.
  const seen: { entry: string; dosName: string; size: number; packed: number }[] = [];
  let problem: DeadAppError | null = null;
  try {
    unzipSync(zip, {
      filter: (f) => {
        if (problem || f.name.endsWith('/')) return false;
        const parts = pathParts(f.name);
        if (!parts || parts.length === 0)
          problem = fail('ZIP_SLIP', `${JSON.stringify(f.name)} points outside the app's folder`);
        else
          seen.push({
            entry: f.name,
            dosName: parts.at(-1)!.toUpperCase(),
            size: f.originalSize,
            packed: f.size,
          });
        return false;
      },
    });
  } catch {
    return fail('NOT_A_ZIP', 'That file is not a zip that can be read');
  }
  if (problem) return problem;
  if (seen.length > LIMITS.maxFiles)
    return fail('TOO_MANY_FILES', `More than ${LIMITS.maxFiles} files`);
  const total = seen.reduce((s, e) => s + e.size, 0);
  const huge = seen.find(
    (e) =>
      e.size > LIMITS.maxFileBytes || (e.size > 1024 * 1024 && e.size > e.packed * LIMITS.maxRatio),
  );
  if (total > LIMITS.maxTotalBytes || huge)
    return fail(
      'TOO_BIG',
      huge ? `${huge.dosName} unpacks too big` : 'The files unpack to over 50 MB',
    );

  const badType = seen.filter(
    (e) => !(ALLOWED_EXTENSIONS as readonly string[]).includes(extension(e.dosName)),
  );
  if (badType.length)
    return fail(
      'FILE_TYPE',
      `Not files a DOS business app needs: ${badType.map((e) => e.dosName).join(', ')}`,
    );
  const badName = seen.find(
    (e) => !isDosFileName(e.dosName) || DEVICES.has(e.dosName.split('.')[0]!),
  );
  if (badName) return fail('NOT_DOS_NAME', `${badName.dosName} is not a DOS 8.3 file name`);
  const names = new Set<string>();
  for (const e of seen) {
    if (names.has(e.dosName)) return fail('DUPLICATE_NAME', `Two files are called ${e.dosName}`);
    names.add(e.dosName);
  }

  const programs = seen
    .filter((e) => ['EXE', 'COM'].includes(extension(e.dosName)))
    .map((e) => e.dosName);
  if (!programs.length) return fail('NO_PROGRAM', 'The zip has no DOS program (EXE or COM)');
  if (!seen.some((e) => extension(e.dosName) === 'DBF'))
    return fail('NO_DBF', 'The zip has no DBF data files');
  const chosen = opts.executable?.toUpperCase();
  const executable = chosen
    ? programs.find((p) => p === chosen)
    : programs.length === 1
      ? programs[0]
      : undefined;
  if (!executable) return fail('WHICH_PROGRAM', 'Choose which program starts the app', programs);

  // Second pass: unpack, and check the real sizes (the declared ones can lie).
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(zip);
  } catch {
    return fail('NOT_A_ZIP', 'That file is not a zip that can be read');
  }
  const files: Record<string, Uint8Array> = {};
  let real = 0;
  for (const e of seen) {
    const bytes = unpacked[e.entry];
    if (!bytes) return fail('NOT_A_ZIP', `${e.dosName} could not be unpacked`);
    real += bytes.length;
    if (bytes.length > LIMITS.maxFileBytes || real > LIMITS.maxTotalBytes)
      return fail('TOO_BIG', `${e.dosName} unpacks too big`);
    files[e.dosName] = bytes;
  }
  for (const p of programs) {
    const check = isDosProgram(p, files[p]!);
    if (!check.ok) return fail('NOT_DOS', `${p} is ${check.why}, not a DOS program`);
  }
  return { ok: true, executable, files };
}
