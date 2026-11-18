// Emulator determinism (Prompt 30). A run is repeatable when it starts from the same bytes on
// drive C:, with the same DOS clock and the same speed. js-dos reads the host clock unless told
// otherwise, so every fresh run fixes it, from a seed.
import { unzipSync } from 'fflate';
import { EmulatorError, dosPath, type EmulatorController } from './controller';

/** A small, well-mixed 32-bit hash (splitmix32), so nearby seeds give unrelated clocks. */
function mix(seed: number): number {
  let z = (seed | 0) + 0x9e3779b9;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A DOS clock from a seed: a day in the `days` from `start`, in shop hours (09:00 to 17:59).
 * Same seed, same clock. Default: the year from 1 July 1998, when the sample apps were in use.
 */
export function seededDosTime(
  seed: number,
  { start = '1998-07-01', days = 365 }: { start?: string; days?: number } = {},
): string {
  const h = mix(seed);
  const day = new Date(`${start}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + (h % days));
  const second = Math.floor(h / days) % (9 * 3600);
  const hh = 9 + Math.floor(second / 3600);
  const mm = Math.floor(second / 60) % 60;
  const ss = second % 60;
  return `${day.toISOString().slice(0, 10)} ${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export type FreshOptions = {
  /** Fixes the DOS clock with seededDosTime(seed) unless dosTime is given. Default 0. */
  seed?: number;
  dosTime?: string;
  cycles?: number;
};

const equalBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Boots the pristine bundle with a fixed clock, checks that drive C: holds exactly the bundle's
 * files, and only then runs `work`. Whatever an earlier run wrote is gone.
 */
export async function withFreshState<R>(
  emu: EmulatorController,
  bundle: Uint8Array,
  { seed = 0, dosTime, cycles }: FreshOptions,
  work: (emu: EmulatorController) => Promise<R>,
): Promise<R> {
  await emu.boot(bundle, {
    dosTime: dosTime ?? seededDosTime(seed),
    ...(cycles ? { cycles } : {}),
  });
  const expected = Object.entries(unzipSync(bundle))
    .filter(([name]) => !name.startsWith('.jsdos/') && !name.endsWith('/'))
    .map(([name, bytes]) => [dosPath(name), bytes] as const);
  const onDrive = await emu.listFiles();
  const names = expected.map(([n]) => n).sort();
  const rootNames = names.filter((n) => !n.includes('/'));
  if (onDrive.join() !== rootNames.join())
    throw new EmulatorError(
      'NOT_FRESH',
      `Drive C: has ${onDrive.join(', ')}, the bundle ${rootNames.join(', ')}`,
    );
  for (const [name, bytes] of expected)
    if (!equalBytes(await emu.readFile(name), bytes))
      throw new EmulatorError('NOT_FRESH', `${name} on drive C: is not the bundle's ${name}`);
  return work(emu);
}
