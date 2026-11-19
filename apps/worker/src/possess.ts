// The possess step until the Possessor exists (Prompt 48): boot the old app in headless js-dos,
// wait for its first screen, and send that screen as a live event. Exploring it is not built yet,
// so the step ends "skipped" and says why.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SEED_PROJECTS } from '@afterlife/db';
import { waitForStableScreen, type EmulatorController } from '@afterlife/emulator';
import { decodeScreen, toWire } from '@afterlife/screen';
import type { StepContext, StepHandler } from './registry';

/** The part of HeadlessPool this step needs (a fake in unit tests). */
export type EmulatorPool = {
  use<R>(bundle: Uint8Array, work: (emu: EmulatorController) => Promise<R>): Promise<R>;
};

const GRAVEYARD = new Set<string>(SEED_PROJECTS.map((p) => p.sourceApp));

/**
 * The js-dos bundle of a Graveyard app, or null. Only the known ids are read, so nothing in a
 * project row can choose a path. Uploaded apps get their bundle in Prompt 40.
 */
export function graveyardBundle(p: { source: string; sourceApp: string }): Uint8Array | null {
  if (p.source !== 'graveyard' || !GRAVEYARD.has(p.sourceApp)) return null;
  const file = new URL(`../../web/public/graveyard/${p.sourceApp}.jsdos`, import.meta.url);
  return new Uint8Array(readFileSync(fileURLToPath(file)));
}

export function possessFirstLook(deps: {
  pool: EmulatorPool;
  bundleFor: (
    p: StepContext['project'],
    projectId: string,
  ) => Promise<Uint8Array | null> | Uint8Array | null;
}): StepHandler {
  return async (ctx) => {
    const bundle = await deps.bundleFor(ctx.project, ctx.projectId);
    if (!bundle)
      return {
        status: 'skipped',
        reason: `There is no js-dos bundle for ${ctx.project.sourceApp} yet`,
      };
    await ctx.log(`Booting ${ctx.project.name} in headless js-dos`);
    const text = await deps.pool.use(bundle, async (emu) => {
      // The first screen with something on it, once it has settled.
      const r = await waitForStableScreen(emu, {
        maxWaitMs: 60_000,
        until: (s) => s.text.some((l) => l.trim() !== ''),
      });
      if (ctx.signal.aborted) throw ctx.signal.reason;
      const shot = await emu.screenshot();
      const grid = decodeScreen(shot.rgba, shot.width, shot.height);
      await ctx.emit('screen', {
        fingerprint: r.screen.fingerprint,
        text: r.screen.text,
        grid: toWire(grid),
      });
      return r.screen.text;
    });
    await ctx.log(`First screen: ${text.find((l) => l.trim() !== '')?.trim() ?? '(blank)'}`);
    return {
      status: 'skipped',
      reason:
        'Exploration is not built yet (Prompt 48): the app was booted and its first screen read',
    };
  };
}
