import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildBundle, prepareBundle } from './bundle';
import type { BootOptions, EmulatorController } from './controller';
import { seededDosTime, withFreshState } from './determinism';
import { FakeEmulator } from './fake-emulator';

const bundle = buildBundle({
  executable: 'SHIFA.EXE',
  files: { 'SHIFA.EXE': new Uint8Array([0x4d, 0x5a]), 'BILLS.DBF': new Uint8Array([1, 2, 3]) },
});

describe('seededDosTime', () => {
  it('the same seed always gives the same clock', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        expect(seededDosTime(seed)).toBe(seededDosTime(seed));
      }),
    );
  });

  it('is a valid DOS clock in shop hours, in the year from the start date', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const t = seededDosTime(seed, { start: '1998-07-01', days: 365 });
        expect(() => prepareBundle(bundle, { dosTime: t })).not.toThrow();
        const [date, time] = t.split(' ');
        expect(date! >= '1998-07-01' && date! < '1999-07-01').toBe(true);
        expect(time! >= '09:00:00' && time! <= '17:59:59').toBe(true);
      }),
    );
  });

  it('different seeds spread over the days', () => {
    const days = new Set(Array.from({ length: 200 }, (_, s) => seededDosTime(s).slice(0, 10)));
    expect(days.size).toBeGreaterThan(100);
  });
});

describe('withFreshState', () => {
  it('boots the pristine bundle with a seeded clock, every time', async () => {
    const emu = new FakeEmulator();
    const seen: (string | undefined)[] = [];
    for (let i = 0; i < 2; i++)
      await withFreshState(emu, bundle, { seed: 7 }, async (e) => {
        seen.push((e as FakeEmulator).dosTime);
        expect(await e.readFile('BILLS.DBF')).toEqual(new Uint8Array([1, 2, 3]));
        await e.writeFile('BILLS.DBF', new Uint8Array([9])); // the next run must not see this
        await e.writeFile('NEW.DAT', new Uint8Array([9]));
      });
    expect(seen).toEqual([seededDosTime(7), seededDosTime(7)]);
  });

  it('an explicit dosTime wins over the seed, and the speed is passed on', async () => {
    const emu = new FakeEmulator();
    await withFreshState(
      emu,
      bundle,
      { dosTime: '1998-07-15 10:00:00', cycles: 50000, seed: 3 },
      async () => {},
    );
    expect(emu.dosTime).toBe('1998-07-15 10:00:00');
    expect(emu.cycles).toBe(50000);
  });

  it('without a seed or time the clock is still fixed (seed 0), never the host clock', async () => {
    const emu = new FakeEmulator();
    await withFreshState(emu, bundle, {}, async () => {});
    expect(emu.dosTime).toBe(seededDosTime(0));
  });

  it('refuses to run on a drive that is not the bundle', async () => {
    // A controller whose boot keeps old files: withFreshState must notice.
    class Sticky extends FakeEmulator {
      private kept: Uint8Array | null = null;
      override async boot(b: Uint8Array, o?: BootOptions) {
        await super.boot(b, o);
        if (this.kept) await this.writeFile('BILLS.DBF', this.kept);
      }
      keep(bytes: Uint8Array) {
        this.kept = bytes;
      }
    }
    const emu = new Sticky();
    emu.keep(new Uint8Array([9]));
    let ran = false;
    await expect(
      withFreshState(emu, bundle, { seed: 1 }, async () => {
        ran = true;
      }),
    ).rejects.toMatchObject({ code: 'NOT_FRESH' });
    expect(ran).toBe(false);
  });

  it('returns what the work returns', async () => {
    const emu: EmulatorController = new FakeEmulator();
    expect(
      await withFreshState(emu, bundle, { seed: 1 }, async (e) => (await e.listFiles()).length),
    ).toBe(2);
  });
});
