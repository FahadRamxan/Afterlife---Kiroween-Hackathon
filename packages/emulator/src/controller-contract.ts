// The behaviour every EmulatorController must have. Run against the fake here; against js-dos in
// the browser (Prompt 27) and headless (Prompt 28) with the same checks.
import { describe, expect, it } from 'vitest';
import { EmulatorError, type EmulatorController } from './controller';
import { KeyParseError } from './keys';

export type ContractSetup = {
  make: () => Promise<EmulatorController>;
  /** A bundle with these files at the root of C:. */
  bundle: Uint8Array;
  files: string[];
};

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof EmulatorError ? e.code : (e as Error).name;
  }
  return 'no error';
};

export function controllerContract(name: string, setup: ContractSetup) {
  describe(`EmulatorController contract: ${name}`, () => {
    const booted = async () => {
      const c = await setup.make();
      await c.boot(setup.bundle);
      return c;
    };

    it('needs boot first', async () => {
      const c = await setup.make();
      expect(await code(c.screenshot())).toBe('NOT_BOOTED');
      expect(await code(c.readFile('MEDICINE.DBF'))).toBe('NOT_BOOTED');
      expect(await code(c.sendKeys('1'))).toBe('NOT_BOOTED');
    });

    it('lists the bundle files on C:, without the .jsdos folder', async () => {
      const c = await booted();
      expect(await c.listFiles()).toEqual([...setup.files].sort());
      expect(await c.listFiles('C:\\')).toEqual([...setup.files].sort());
    });

    it('reads and writes files by DOS path, in any spelling', async () => {
      const c = await booted();
      const bytes = new Uint8Array([1, 2, 3]);
      await c.writeFile('c:\\test.dat', bytes);
      expect(await c.readFile('TEST.DAT')).toEqual(bytes);
      expect(await c.listFiles()).toContain('TEST.DAT');
      expect(await code(c.readFile('NOPE.DAT'))).toBe('NO_FILE');
      expect(await code(c.readFile('../etc/passwd'))).toBe('BAD_PATH');
    });

    it('reset puts the files back as they were in the bundle', async () => {
      const c = await booted();
      const first = setup.files[0]!;
      const before = await c.readFile(first);
      await c.writeFile(first, new Uint8Array([9]));
      await c.writeFile('NEW.DAT', new Uint8Array([9]));
      await c.reset();
      expect(await c.readFile(first)).toEqual(before);
      expect(await c.listFiles()).not.toContain('NEW.DAT');
    });

    it('snapshotState and restoreState round-trip the files', async () => {
      const c = await booted();
      await c.writeFile('A.DAT', new Uint8Array([7, 7]));
      const state = await c.snapshotState();
      await c.writeFile('A.DAT', new Uint8Array([0]));
      await c.writeFile('B.DAT', new Uint8Array([0]));
      await c.restoreState(state);
      expect(await c.readFile('A.DAT')).toEqual(new Uint8Array([7, 7]));
      expect(await c.listFiles()).not.toContain('B.DAT');
    });

    it('refuses a bad key sequence before typing anything', async () => {
      const c = await booted();
      expect(await code(c.sendKeys('{Nope}'))).toBe(KeyParseError.name);
    });

    it('takes a text-mode screenshot', async () => {
      const c = await booted();
      const s = await c.screenshot();
      expect([640, 720]).toContain(s.width);
      expect(s.height).toBe(400);
      expect(s.rgba).toHaveLength(s.width * s.height * 4);
    });

    it('accepts a sensible speed and refuses a silly one', async () => {
      const c = await booted();
      await c.setSpeed(50_000);
      expect(await code(c.setSpeed(0))).toBe('BAD_SPEED');
      expect(await code(c.setSpeed(1.5))).toBe('BAD_SPEED');
    });
  });
}
