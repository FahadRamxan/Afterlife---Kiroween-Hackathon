import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FakeEmulator, buildBundle, type EmulatorController } from '@afterlife/emulator';
import {
  ScreenWireSchema,
  fromWire,
  gridText,
  renderScreen,
  type CellInput,
} from '@afterlife/screen';
import { describe, expect, it } from 'vitest';
import { graveyardBundle, graveyardDosTime, possessFirstLook } from './possess';
import type { StepContext } from './registry';

function menu(title: string) {
  const cells: CellInput[][] = Array.from({ length: 25 }, (_, r) =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: 15, bg: r === 0 ? 3 : 1 })),
  );
  [...title].forEach((ch, k) => (cells[0]![30 + k]!.code = ch.charCodeAt(0)));
  return renderScreen({ cellWidth: 8, cellHeight: 16, cells });
}

/** Runs `work` on a fake emulator showing the Shifa main menu, like HeadlessPool.use. */
const fakePool = {
  booted: 0,
  boots: [] as ({ dosTime?: string } | undefined)[],
  async use<R>(
    _bundle: Uint8Array,
    work: (emu: EmulatorController) => Promise<R>,
    boot?: { dosTime?: string },
  ) {
    this.booted++;
    this.boots.push(boot);
    const emu = new FakeEmulator({ screen: menu('SHIFA MAIN MENU') });
    await emu.boot(
      buildBundle({
        executable: 'SHIFA.EXE',
        files: { 'SHIFA.EXE': new Uint8Array([0x4d, 0x5a]) },
      }),
    );
    return work(emu);
  },
};

function ctx(sourceApp: string, events: [string, unknown][]): StepContext {
  return {
    projectId: '0192f5a0-0000-7000-8000-000000000001',
    project: { name: 'Shifa Medical Store', source: 'graveyard', sourceApp },
    step: 'possess',
    attempt: 1,
    force: false,
    signal: new AbortController().signal,
    emit: async (type, payload) => {
      events.push([type, payload]);
    },
    log: async (message) => {
      events.push(['log', { message }]);
    },
  };
}

describe('possess (first look, until the Possessor in Prompt 48)', () => {
  it('boots the app, sends its first screen as a decoded grid, and is skipped (not done)', async () => {
    const events: [string, unknown][] = [];
    const handler = possessFirstLook({ pool: fakePool, bundleFor: () => new Uint8Array([1]) });
    const r = await handler(ctx('shifa', events));
    expect(r).toEqual({
      status: 'skipped',
      reason: expect.stringMatching(/Exploration is not built yet \(Prompt 48\)/),
    });
    const screen = events.find(([t]) => t === 'screen')![1] as {
      fingerprint: string;
      grid: unknown;
    };
    expect(screen.fingerprint).toMatch(/^fp_[0-9a-f]{16}$/);
    const grid = fromWire(ScreenWireSchema.parse(screen.grid));
    expect(gridText(grid)[0]).toContain('SHIFA MAIN MENU');
  });

  it("boots at the app's own DOS clock (found in the Prompts 31 to 40 review)", async () => {
    // Without it js-dos kept a clock of its own: Iqra, a 2001 app, showed 25-06-1998.
    await possessFirstLook({
      pool: fakePool,
      bundleFor: () => new Uint8Array([1]),
      dosTimeFor: () => '2001-03-12 10:00:00',
    })(ctx('iqra', []));
    expect(fakePool.boots.at(-1)).toEqual({ dosTime: '2001-03-12 10:00:00' });
  });

  it('an app with no bundle (an upload, until Prompt 40) is skipped without booting anything', async () => {
    const events: [string, unknown][] = [];
    const before = fakePool.booted;
    const r = await possessFirstLook({ pool: fakePool, bundleFor: () => null })(
      ctx('upload.zip', events),
    );
    expect(r).toMatchObject({
      status: 'skipped',
      reason: expect.stringMatching(/no js-dos bundle/i),
    });
    expect(fakePool.booted).toBe(before);
  });
});

describe('graveyardDosTime', () => {
  it("is each Graveyard app's manifest clock", () => {
    for (const app of ['shifa', 'iqra', 'barkat']) {
      const manifest = JSON.parse(
        readFileSync(resolve(__dirname, `../../../samples/graveyard/${app}/manifest.json`), 'utf8'),
      ) as { dosTime: string };
      expect(graveyardDosTime({ source: 'graveyard', sourceApp: app })).toBe(manifest.dosTime);
    }
    expect(graveyardDosTime({ source: 'graveyard', sourceApp: 'iqra' })).toMatch(/^2001-/);
  });

  it('never reads a path from the project: unknown apps, uploads and path tricks get nothing', () => {
    for (const sourceApp of ['../../../etc/passwd', 'shifa/../iqra', 'doom', ''])
      expect(graveyardDosTime({ source: 'graveyard', sourceApp })).toBeUndefined();
    expect(graveyardDosTime({ source: 'upload', sourceApp: 'shifa' })).toBeUndefined();
  });
});

describe('graveyardBundle', () => {
  it('reads the bundle of a Graveyard app', () => {
    const real = new Uint8Array(
      readFileSync(resolve(__dirname, '../../web/public/graveyard/shifa.jsdos')),
    );
    expect(graveyardBundle({ source: 'graveyard', sourceApp: 'shifa' })).toEqual(real);
  });

  it('never reads a path from the project: unknown apps, uploads and path tricks get null', () => {
    for (const sourceApp of ['../../../etc/passwd', 'shifa/../iqra', 'doom', ''])
      expect(graveyardBundle({ source: 'graveyard', sourceApp })).toBeNull();
    expect(graveyardBundle({ source: 'upload', sourceApp: 'shifa' })).toBeNull();
  });
});
