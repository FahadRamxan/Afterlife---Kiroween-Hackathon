// The action recorder (Prompt 29): one observation, the core data unit of Afterlife. Snapshot the
// data files, press the keys, wait for the screen to settle, snapshot again, and diff.
import { diffSnapshots, snapshot, type SnapshotDiff } from '@afterlife/dbf';
import {
  analyzeScreen,
  decodeScreen,
  fingerprint,
  gridText,
  type ScreenModel,
} from '@afterlife/screen';
import type { EmulatorController } from './controller';
import { parseKeys, printKeys, type KeyStroke } from './keys';

/** A screen as the Crew keeps it: its layout id, its text, what is on it, and the cursor. */
export type ObservedScreen = {
  fingerprint: string;
  text: string[];
  model: ScreenModel;
  cursor: { row: number; col: number } | null;
};

export type Observation = {
  /** The keys pressed, in canonical spelling ("1{Enter}PAN500{Enter}"). */
  keys: string;
  screenBefore: ObservedScreen;
  screenAfter: ObservedScreen;
  /** What the keys changed in the data files. */
  dbfDiff: SnapshotDiff;
  /** From the first key to the settled screen. */
  durationMs: number;
  /** false if the screen was still changing at maxWaitMs (a clock, an animation). */
  stable: boolean;
};

export type RecordOptions = {
  /** The data files to watch. Default: every .DBF in the root of drive C:. */
  files?: string[];
  /** The screen must not change for this long (default 300 ms). */
  stableMs?: number;
  /** How often to look (default 50 ms). */
  pollMs?: number;
  /** Give up waiting for a settled screen after this (default 10 s). */
  maxWaitMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The current screen, read back from the emulator's pixels. */
export async function observeScreen(emu: EmulatorController): Promise<ObservedScreen> {
  const shot = await emu.screenshot();
  const grid = decodeScreen(shot.rgba, shot.width, shot.height);
  const model = analyzeScreen(grid);
  return {
    fingerprint: await fingerprint(model),
    text: gridText(grid),
    model,
    cursor: grid.cursor,
  };
}

async function dataSnapshot(emu: EmulatorController, files: string[]) {
  return snapshot(
    Object.fromEntries(await Promise.all(files.map(async (f) => [f, await emu.readFile(f)]))),
  );
}

/**
 * Waits until the screen has looked the same for stableMs: the same fingerprint and the same
 * text, so a value still being typed counts as a change. Stops at maxWaitMs.
 */
export async function waitForStableScreen(
  emu: EmulatorController,
  { stableMs = 300, pollMs = 50, maxWaitMs = 10_000 }: Omit<RecordOptions, 'files'> = {},
): Promise<{ screen: ObservedScreen; stable: boolean }> {
  const start = Date.now();
  let screen = await observeScreen(emu);
  let since = Date.now();
  const same = (a: ObservedScreen, b: ObservedScreen) =>
    a.fingerprint === b.fingerprint && a.text.join('\n') === b.text.join('\n');
  for (;;) {
    if (Date.now() - since >= stableMs) return { screen, stable: true };
    if (Date.now() - start >= maxWaitMs) return { screen, stable: false };
    await sleep(pollMs);
    const next = await observeScreen(emu);
    if (!same(next, screen)) {
      screen = next;
      since = Date.now();
    }
  }
}

/** Presses `keys` and records what it did. */
export async function recordAction(
  emu: EmulatorController,
  keys: string | KeyStroke[],
  options: RecordOptions = {},
): Promise<Observation> {
  const strokes = typeof keys === 'string' ? parseKeys(keys) : keys;
  const files = options.files ?? (await emu.listFiles()).filter((f) => /\.DBF$/.test(f));
  const before = await dataSnapshot(emu, files);
  const screenBefore = await observeScreen(emu);
  const start = Date.now();
  await emu.sendKeys(strokes);
  const { screen: screenAfter, stable } = await waitForStableScreen(emu, options);
  const durationMs = Date.now() - start;
  const after = await dataSnapshot(emu, files);
  return {
    keys: printKeys(strokes),
    screenBefore,
    screenAfter,
    dbfDiff: diffSnapshots(before, after),
    durationMs,
    stable,
  };
}
