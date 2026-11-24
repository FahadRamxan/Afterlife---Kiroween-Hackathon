// The old app in the emulator, as the differential runner drives it (Prompt 68). For each case it
// goes to the action's screen by the screen graph the Possessor mapped (replayPath), types the
// action's macro filled in with the case, one step at a time as a person types (the text, then
// the key that ends it, waiting for the screen to settle in between), and diffs the data files
// from before the first key to after the last. A screen the graph does not know (a message box)
// is left with Esc, which always returns to safety.
import { replayPath, type ScreenGraphJson } from '@afterlife/crew';
import { diffSnapshots, snapshot } from '@afterlife/dbf';
import {
  keySteps,
  observeScreen,
  parseKeys,
  recordAction,
  waitForStableScreen,
  type EmulatorController,
} from '@afterlife/emulator';
import { expandMacro, type Soul } from '@afterlife/soul';
import type { ProofCase } from './arbitraries';
import type { OldApp } from './runner';

export type EmulatorOldAppOptions = {
  soul: Soul;
  graph: Pick<ScreenGraphJson, 'nodes' | 'edges'>;
  /** Waiting for the app after a boot (default 60 s: a slow DOS program on a loaded machine). */
  bootWaitMs?: number;
  /**
   * After the last key, how long the data files must stay as they are when nothing was written
   * yet (default 1.5 s): on a loaded machine the app can sit on a settled screen before it saves.
   * Once something was written, 300 ms of quiet is enough (a DBF is written in several steps).
   */
  dataQuietMs?: number;
};

/** At most this many Esc presses to leave a screen the graph does not know. */
const MAX_ESC = 3;

const readBytes = async (emu: EmulatorController, files: string[]) =>
  Object.fromEntries(await Promise.all(files.map(async (f) => [f, await emu.readFile(f)])));
async function readData(emu: EmulatorController, files: string[]) {
  return snapshot(await readBytes(emu, files));
}
const sameBytes = (a: Record<string, Uint8Array>, b: Record<string, Uint8Array>) =>
  Object.keys(a).every((f) => {
    const x = a[f]!;
    const y = b[f]!;
    return x.length === y.length && x.every((v, i) => v === y[i]);
  });
/** Waits until the data files stop changing: quietMs if nothing was written yet, else 300 ms. */
async function settleData(
  emu: EmulatorController,
  files: string[],
  before: Record<string, Uint8Array>,
  quietMs: number,
) {
  let last = await readBytes(emu, files);
  let since = Date.now();
  for (;;) {
    const wrote = !sameBytes(last, before);
    if (Date.now() - since >= (wrote ? 300 : quietMs)) return;
    await new Promise((r) => setTimeout(r, 100));
    const now = await readBytes(emu, files);
    if (!sameBytes(now, last)) {
      last = now;
      since = Date.now();
    }
  }
}

/**
 * After typing a text, waits until the line the cursor is on shows all of it. A loaded emulator
 * can lose keys: the field then shows only the start of the text, and pressing the key that ends
 * it would save something nobody typed. That is an error (the runner starts both sides again and
 * tries the case once more), not something the old app did. A blank screen (a fake) is not checked.
 */
async function typedShows(emu: EmulatorController, text: string, maxWaitMs = 5000) {
  const want = text.toUpperCase();
  const start = Date.now();
  for (;;) {
    const s = await observeScreen(emu);
    // A blank screen (a fake) shows nothing to check.
    if (s.text.every((l) => !l.trim())) return;
    // The cursor's line; when the cursor is not shown (it blinks), anywhere on the screen.
    const lines = s.cursor ? [s.text[s.cursor.row] ?? ''] : s.text;
    if (lines.some((l) => l.toUpperCase().includes(want))) return;
    if (Date.now() - start >= maxWaitMs) {
      // What of the text the field holds: the longest start of it before the cursor.
      const before = s.cursor ? lines[0]!.slice(0, s.cursor.col).toUpperCase().trimEnd() : '';
      let got = '';
      for (let n = want.length - 1; n > 0; n--)
        if (before.endsWith(want.slice(0, n))) {
          got = text.slice(0, n);
          break;
        }
      throw new Error(`The old app did not get all the keys typed: "${text}" shows as "${got}"`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}
/** Drives an emulator that has booted the old app. reset() boots it again on its own files. */
export function emulatorOldApp(emu: EmulatorController, opts: EmulatorOldAppOptions): OldApp {
  const known = new Set([
    ...opts.graph.nodes.map((n) => n.fingerprint),
    ...opts.graph.edges.flatMap((e) => [e.from, e.to]),
  ]);
  const booted = () =>
    waitForStableScreen(emu, {
      maxWaitMs: opts.bootWaitMs ?? 60_000,
      until: (s) => s.text.some((l) => l.trim() !== ''),
    });
  // Freshly booted: wait for its first screen before the next case (not before: a lane that ends
  // after a reset closes the emulator, and nothing must still be looking at it).
  let fresh = true;
  return {
    async run(c: ProofCase) {
      const action = opts.soul.actions.find((a) => a.id === c.actionId);
      if (!action) throw new Error(`The Soul has no action ${c.actionId}`);
      if (fresh) {
        await booted();
        fresh = false;
      }
      let at = (await observeScreen(emu)).fingerprint;
      for (let i = 0; i < MAX_ESC && !known.has(at); i++)
        at = (await recordAction(emu, '{Esc}', { files: [] })).screenAfter.fingerprint;
      await replayPath(emu, opts.graph, at, action.screen, { record: { files: [] } });
      const files = (await emu.listFiles()).filter((f) => /\.DBF$/i.test(f));
      const raw = await readBytes(emu, files);
      const before = await snapshot(raw);
      const typedValues = [
        ...Object.values(c.inputs.values ?? {}),
        ...(c.inputs.lines ?? []).flatMap((l) => Object.values(l)),
      ]
        .map((v) => String(v ?? ''))
        .filter((v) => v.trim() !== '');
      for (const keys of keySteps(expandMacro(action.keys, c.inputs))) {
        const strokes = parseKeys(keys);
        const end = strokes.at(-1)?.kind === 'key' ? strokes.length - 1 : strokes.length;
        const text = strokes
          .slice(0, end)
          .map((s) => (s.kind === 'text' ? s.text : ''))
          .join('');
        if (text) {
          await emu.sendKeys(strokes.slice(0, end));
          // The value typed into a field ends the text (before it can come a menu key, the
          // "A" of Add): that is what the field must show.
          const value = typedValues
            .filter((v) => text.toUpperCase().endsWith(v.toUpperCase()))
            .sort((a, b) => b.length - a.length)[0];
          if (value) await typedShows(emu, value);
        }
        if (end < strokes.length) await emu.sendKeys(strokes.slice(end));
        await waitForStableScreen(emu);
      }
      await settleData(emu, files, raw, opts.dataQuietMs ?? 1500);
      const after = await readData(emu, files);
      return { effects: diffSnapshots(before, after), screen: (await observeScreen(emu)).text };
    },
    async reset() {
      await emu.reset();
      fresh = true;
    },
  };
}
