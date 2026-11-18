import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

/** A bad bundle request: unsafe file name, missing executable, or not a DOS program. */
export class BundleError extends Error {
  override name = 'BundleError';
}

/**
 * True for a plain DOS 8.3 file name in upper case: no folders, no drive, no "..".
 * Bundles only ever hold names like this, so a crafted name cannot escape the bundle root.
 */
export function isDosFileName(name: string): boolean {
  return /^[A-Z0-9_-]{1,8}(\.[A-Z0-9_-]{1,3})?$/.test(name);
}

export type DosboxOptions = { executable: string };

/** The .jsdos/dosbox.conf that mounts the bundle as C: and starts the program. */
export function dosboxConf({ executable }: DosboxOptions): string {
  if (!isDosFileName(executable)) throw new BundleError(`Not a DOS file name: ${executable}`);
  if (!/\.(EXE|COM)$/.test(executable))
    throw new BundleError(`The executable must be an EXE or COM file: ${executable}`);
  return [
    '[sdl]',
    'autolock=false',
    '',
    '[dosbox]',
    'machine=svga_s3',
    'memsize=16',
    '',
    '[cpu]',
    '# Fixed speed: repeatable runs, and fast enough for a text-mode business app.',
    'core=auto',
    'cycles=fixed 20000',
    '',
    '[mixer]',
    'nosound=true',
    '',
    '[autoexec]',
    'mount c .',
    'c:',
    executable,
    '',
  ].join('\n');
}

/** Every file in a bundle gets this timestamp, so the same input gives the same bytes. */
// Zip stores DOS local time and fflate reads the Date with local getters, so a UTC Date gave
// 15:00 in Pakistan and 10:00 on a UTC machine. A local-time Date gives 10:00 everywhere.
const FIXED_MTIME = new Date(1998, 6, 15, 10, 0, 0);

export type BundleInput = {
  executable: string;
  /** DOS file name -> contents. Everything goes in the root of drive C:. */
  files: Record<string, Uint8Array>;
};

/** Builds a js-dos v8 bundle: a zip with .jsdos/dosbox.conf plus the program files. */
export function buildBundle({ executable, files }: BundleInput): Uint8Array {
  for (const name of Object.keys(files))
    if (!isDosFileName(name))
      throw new BundleError(`Unsafe or non-DOS file name in bundle: ${JSON.stringify(name)}`);
  if (!files[executable]) throw new BundleError(`${executable} is not in the bundle`);

  const entries: Zippable = {
    '.jsdos/dosbox.conf': [
      new TextEncoder().encode(dosboxConf({ executable })),
      { mtime: FIXED_MTIME },
    ],
  };
  for (const name of Object.keys(files).sort())
    entries[name] = [files[name]!, { mtime: FIXED_MTIME }];
  return zipSync(entries, { level: 9 });
}

export type PrepareOptions = {
  /** Fixed CPU speed in DOSBox cycles. */
  cycles?: number;
  /** The DOS clock when the program starts, "YYYY-MM-DD HH:MM:SS" (1980 to 2099). */
  dosTime?: string;
  /** Replaces every file on drive C: (DOS paths such as "DATA/X.DBF"), keeping the config. */
  files?: Record<string, Uint8Array>;
};

const DOS_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

function clockLines(dosTime: string): string {
  const m = DOS_TIME.exec(dosTime);
  const [y, mo, d, h, mi, sec] = (m ?? []).slice(1).map(Number) as number[];
  const real = m && new Date(Date.UTC(y!, mo! - 1, d!));
  if (
    !m ||
    y! < 1980 ||
    y! > 2099 ||
    real!.getUTCMonth() !== mo! - 1 ||
    real!.getUTCDate() !== d ||
    h! > 23 ||
    mi! > 59 ||
    sec! > 59
  )
    throw new BundleError(`Not a DOS date and time (YYYY-MM-DD HH:MM:SS, 1980-2099): ${dosTime}`);
  // DOSBox's DATE takes MM-DD-YYYY (it ignores a two-digit year).
  return `time ${m[4]}:${m[5]}:${m[6]}\ndate ${m[2]}-${m[3]}-${m[1]}\n`;
}

/**
 * A bundle ready to boot with these options: the speed and the DOS clock go into
 * .jsdos/dosbox.conf, and `files` (a saved state) replaces drive C:. Same input, same bytes.
 */
export function prepareBundle(bundle: Uint8Array, options: PrepareOptions = {}): Uint8Array {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bundle);
  } catch {
    throw new BundleError('Not a js-dos bundle: the file is not a zip');
  }
  const confBytes = entries['.jsdos/dosbox.conf'];
  if (!confBytes) throw new BundleError('Not a js-dos bundle: no .jsdos/dosbox.conf');
  let conf = strFromU8(confBytes);
  if (options.cycles !== undefined)
    conf = conf.replace(/^cycles=.*$/m, `cycles=fixed ${options.cycles}`);
  if (options.dosTime !== undefined) {
    const lines = clockLines(options.dosTime);
    if (!conf.includes('mount c .\nc:\n'))
      throw new BundleError('The bundle does not mount drive C:');
    conf = conf.replace('mount c .\nc:\n', `mount c .\nc:\n${lines}`);
  }
  const drive = options.files
    ? options.files
    : Object.fromEntries(
        Object.entries(entries).filter(([n]) => !n.startsWith('.jsdos/') && !n.endsWith('/')),
      );
  const out: Zippable = { '.jsdos/dosbox.conf': [strToU8(conf), { mtime: FIXED_MTIME }] };
  for (const name of Object.keys(drive).sort()) out[name] = [drive[name]!, { mtime: FIXED_MTIME }];
  return zipSync(out, { level: 9 });
}
