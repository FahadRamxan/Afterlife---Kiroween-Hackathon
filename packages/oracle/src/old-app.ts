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
};

/** At most this many Esc presses to leave a screen the graph does not know. */
const MAX_ESC = 3;

async function readData(emu: EmulatorController, files: string[]) {
  return snapshot(
    Object.fromEntries(await Promise.all(files.map(async (f) => [f, await emu.readFile(f)]))),
  );
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
      const before = await readData(emu, files);
      for (const keys of keySteps(expandMacro(action.keys, c.inputs))) {
        await emu.sendKeys(keys);
        await waitForStableScreen(emu);
      }
      const after = await readData(emu, files);
      return { effects: diffSnapshots(before, after), screen: (await observeScreen(emu)).text };
    },
    async reset() {
      await emu.reset();
      fresh = true;
    },
  };
}
