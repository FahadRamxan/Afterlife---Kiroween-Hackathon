import { writeDbf, type DbfRecord } from '@afterlife/dbf';
import { renderScreen, type CellInput } from '@afterlife/screen';
import { describe, expect, it } from 'vitest';
import { buildBundle } from './bundle';
import type { Screenshot } from './controller';
import { FakeEmulator } from './fake-emulator';
import { recordAction } from './recorder';

/** A blue DOS screen with a cyan title bar saying `title`, and `lines` of body text. */
function screen(title: string, lines: string[] = []): Screenshot {
  const cells: CellInput[][] = Array.from({ length: 25 }, (_, r) =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: 15, bg: r === 0 ? 3 : 1 })),
  );
  const put = (r: number, c: number, s: string) =>
    [...s].forEach((ch, k) => (cells[r]![c + k]!.code = ch.charCodeAt(0)));
  put(0, 1, 'SHIFA MEDICAL STORE');
  put(0, 36, title);
  lines.forEach((l, i) => put(3 + i, 1, l));
  return renderScreen({ cellWidth: 8, cellHeight: 16, cells });
}

const bills = (n: number) =>
  writeDbf({
    fields: [
      { name: 'BILL_NO', type: 'C', length: 9, decimals: 0 },
      { name: 'TOTAL', type: 'N', length: 11, decimals: 2 },
    ],
    records: Array.from({ length: n }, (_, i): DbfRecord => ({
      deleted: false,
      values: { BILL_NO: `9807-000${i + 1}`, TOTAL: '102.37' },
    })),
  });

const bundle = buildBundle({
  executable: 'SHIFA.EXE',
  files: {
    'SHIFA.EXE': new Uint8Array([0x4d, 0x5a]),
    'BILLS.DBF': bills(0),
    'NOTES.TXT': new Uint8Array([1]),
  },
});

const FAST = { pollMs: 5, stableMs: 30, maxWaitMs: 2000 };

describe('recordAction', () => {
  it('a key that does nothing gives an empty diff and the same screen', async () => {
    const emu = new FakeEmulator({ screen: screen('MAIN MENU', ['1  New Bill']) });
    await emu.boot(bundle);
    const obs = await recordAction(emu, '{Esc}', FAST);
    expect(obs.keys).toBe('{Esc}');
    expect(obs.dbfDiff.tables).toEqual({});
    expect(obs.dbfDiff.unchanged).toEqual(['BILLS.DBF']);
    expect(obs.screenAfter.fingerprint).toBe(obs.screenBefore.fingerprint);
    expect(obs.screenAfter.text).toEqual(obs.screenBefore.text);
    expect(obs.stable).toBe(true);
  });

  it('saving a bill gives the inserted record and the new screen', async () => {
    const emu = new FakeEmulator({
      screen: screen('NEW BILL', ['SUBTOTAL 87.50']),
      onKeys: (keys, app) => {
        if (keys.some((k) => k.kind === 'key' && k.key === 'F2')) {
          app.files.set('BILLS.DBF', bills(1));
          app.setScreen(screen('NEW BILL', ['BILL 9807-0001 SAVED']));
        }
      },
    });
    await emu.boot(bundle);
    const obs = await recordAction(emu, '{F2}', FAST);
    expect(obs.dbfDiff.tables['BILLS.DBF']!.inserted.map((r) => r.values)).toEqual([
      { BILL_NO: '9807-0001', TOTAL: '102.37' },
    ]);
    expect(obs.screenBefore.text.join('\n')).toContain('SUBTOTAL 87.50');
    expect(obs.screenAfter.text.join('\n')).toContain('BILL 9807-0001 SAVED');
    expect(obs.screenAfter.model.title?.name).toBe('NEW BILL');
    expect(obs.screenBefore.fingerprint).toMatch(/^fp_[0-9a-f]{16}$/);
    expect(obs.durationMs).toBeGreaterThanOrEqual(FAST.stableMs);
  });

  it('waits until the screen stops changing, and records the last screen', async () => {
    const emu = new FakeEmulator({
      screen: screen('MAIN MENU'),
      onKeys: (_keys, app) => {
        // The app draws the next screen in steps, the last one 60 ms after the key.
        setTimeout(() => app.setScreen(screen('STOCK', ['loading'])), 20);
        setTimeout(() => app.setScreen(screen('STOCK', ['PAN500 PANADOL 500MG STRIP'])), 60);
      },
    });
    await emu.boot(bundle);
    // The redraws are 40 ms apart, so the window must be longer than that to wait for the last.
    const slow = { ...FAST, stableMs: 100 };
    const obs = await recordAction(emu, '2', slow);
    expect(obs.screenAfter.model.title?.name).toBe('STOCK');
    expect(obs.screenAfter.text.join('\n')).toContain('PAN500 PANADOL 500MG STRIP');
    expect(obs.stable).toBe(true);
    expect(obs.durationMs).toBeGreaterThanOrEqual(60 + slow.stableMs);
  });

  it('a screen that never settles stops at maxWaitMs and says so', async () => {
    let n = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const emu = new FakeEmulator({
      screen: screen('CLOCK', ['0']),
      onKeys: (_keys, app) => {
        timer = setInterval(
          () => app.setScreen(screen('CLOCK', [`tick ${++n} ${'x'.repeat(n % 7)}`])),
          10,
        );
      },
    });
    await emu.boot(bundle);
    try {
      const obs = await recordAction(emu, '{Enter}', { pollMs: 5, stableMs: 50, maxWaitMs: 200 });
      expect(obs.stable).toBe(false);
      expect(obs.durationMs).toBeGreaterThanOrEqual(200);
      expect(obs.durationMs).toBeLessThan(1000);
    } finally {
      clearInterval(timer);
    }
  });

  it('only the files asked for are watched', async () => {
    const emu = new FakeEmulator({ screen: screen('MAIN MENU') });
    await emu.boot(bundle);
    const obs = await recordAction(emu, '{Esc}', { ...FAST, files: [] });
    expect(obs.dbfDiff.unchanged).toEqual([]);
  });

  it('records the keys in their canonical spelling', async () => {
    const emu = new FakeEmulator({ screen: screen('MAIN MENU') });
    await emu.boot(bundle);
    expect((await recordAction(emu, '{enter}{alt+x}', FAST)).keys).toBe('{Enter}{Alt+X}');
  });
});
