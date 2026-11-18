// The EmulatorController interface (Prompt 26): what the Crew needs from an emulator, whichever
// one runs it (js-dos in the browser, headless js-dos on the worker, or the fake in tests).
import { isDosFileName } from './bundle';
import type { KeyStroke } from './keys';

/** One emulator frame: RGBA pixels, 640x400 or 720x400 in text mode. */
export type Screenshot = { width: number; height: number; rgba: Uint8Array };

/**
 * What can be saved and put back: the files on drive C: (DOS path -> bytes). js-dos cannot save
 * the CPU and memory, so restoring means these files and a fresh boot of the program.
 */
export type EmulatorState = { files: Record<string, Uint8Array> };

export type BootOptions = {
  /** Fixed CPU speed in DOSBox cycles (default 20000, as in every bundle). */
  cycles?: number;
  /** The DOS clock at boot, "YYYY-MM-DD HH:MM:SS". Default: the bundle's. */
  dosTime?: string;
};

export interface EmulatorController {
  /** Starts a js-dos bundle (.jsdos zip). Everything else needs this first. */
  boot(bundle: Uint8Array, options?: BootOptions): Promise<void>;
  /** Types a key sequence ("1{Enter}PANADOL{Tab}2{F2}") or parsed keystrokes. */
  sendKeys(keys: string | KeyStroke[]): Promise<void>;
  screenshot(): Promise<Screenshot>;
  /** A file on drive C: by DOS path ("MEDICINE.DBF", "C:\\DATA\\BILLS.DBF"). */
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  /** Files on drive C: under a folder (default the root), as DOS paths, sorted. */
  listFiles(dir?: string): Promise<string[]>;
  setSpeed(cycles: number): Promise<void>;
  /** Boots the same bundle again, with its files as they were in the bundle. */
  reset(): Promise<void>;
  snapshotState(): Promise<EmulatorState>;
  restoreState(state: EmulatorState): Promise<void>;
  /** Stops the emulator. */
  exit(): Promise<void>;
}

export type EmulatorErrorCode =
  | 'NOT_BOOTED'
  | 'NO_FILE'
  | 'BAD_PATH'
  | 'BAD_SPEED'
  | 'BAD_BUNDLE'
  /** The emulator did not answer in time. */
  | 'TIMEOUT';

export class EmulatorError extends Error {
  override name = 'EmulatorError';
  constructor(
    readonly code: EmulatorErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const MIN_CYCLES = 100;
export const MAX_CYCLES = 1_000_000;

export function checkCycles(cycles: number): number {
  if (!Number.isInteger(cycles) || cycles < MIN_CYCLES || cycles > MAX_CYCLES)
    throw new EmulatorError(
      'BAD_SPEED',
      `Speed must be a whole number of cycles from ${MIN_CYCLES} to ${MAX_CYCLES}, not ${cycles}`,
    );
  return cycles;
}

/**
 * A DOS path on drive C: in one spelling: upper case, "/" between folders, no drive.
 * "c:\\data\\bills.dbf" -> "DATA/BILLS.DBF". Every part must be an 8.3 name, so a path can never
 * leave the drive.
 */
export function dosPath(path: string): string {
  const parts = path
    .replace(/^[cC]:/, '')
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((p) => p.toUpperCase());
  if (parts.length === 0 || !parts.every(isDosFileName))
    throw new EmulatorError('BAD_PATH', `Not a DOS path on drive C: ${JSON.stringify(path)}`);
  return parts.join('/');
}

/** A folder on drive C: ("" for the root). */
export function dosDir(dir = ''): string {
  return dir.replace(/^[cC]:/, '').replace(/[\\/]+/g, '') === '' ? '' : dosPath(dir);
}
