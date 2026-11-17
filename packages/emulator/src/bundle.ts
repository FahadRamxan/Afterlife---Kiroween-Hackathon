import { zipSync, type Zippable } from 'fflate';

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
