import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  BrowserJsDos,
  flattenTree,
  type JsDosCi,
  type JsDosEmulators,
  type JsDosFsNode,
} from './browser-jsdos';
import { buildBundle } from './bundle';
import { controllerContract } from './controller-contract';

const DIST = resolve(__dirname, '../../../samples/graveyard/dist/shifa');
const FILES = ['BILLITEM.DBF', 'BILLS.DBF', 'CUSTOMER.DBF', 'MEDICINE.DBF', 'SHIFA.EXE'];
const bundle = buildBundle({
  executable: 'SHIFA.EXE',
  files: Object.fromEntries(FILES.map((f) => [f, new Uint8Array(readFileSync(resolve(DIST, f)))])),
});

/** js-dos v8 as measured in Chromium (Prompt 27): paths relative to C:, and in the worker a read
 * of a missing file never settles. */
function fakeJsDos() {
  const booted: Uint8Array[] = [];
  const pressed: number[][] = [];
  let exits = 0;
  const make = async (init: Uint8Array): Promise<JsDosCi> => {
    booted.push(init);
    const files = new Map(Object.entries(unzipSync(init)));
    const tree = (): JsDosFsNode => {
      const root: JsDosFsNode = { name: '.', size: null, nodes: [] };
      for (const [path, bytes] of files) {
        let node = root;
        const parts = path.split('/').filter(Boolean);
        parts.forEach((part, k) => {
          const leaf = k === parts.length - 1;
          let next = node.nodes!.find((n) => n.name === part);
          if (!next) {
            next = leaf
              ? { name: part, size: bytes.length, nodes: null }
              : { name: part, size: null, nodes: [] };
            node.nodes!.push(next);
          }
          node = next;
        });
      }
      return root;
    };
    return {
      fsTree: async () => tree(),
      fsReadFile: (path) => {
        const bytes = files.get(path.replace(/^\//, ''));
        return bytes ? Promise.resolve(bytes.slice()) : new Promise<Uint8Array>(() => {});
      },
      fsWriteFile: async (path, contents) => {
        files.set(path.replace(/^\//, ''), (contents as Uint8Array).slice());
      },
      screenshot: async () => ({
        width: 640,
        height: 400,
        data: new Uint8ClampedArray(640 * 400 * 4),
      }),
      simulateKeyPress: (...codes) => {
        pressed.push(codes);
      },
      exit: async () => {
        exits++;
      },
    };
  };
  const emulators: JsDosEmulators = { dosboxWorker: make, dosboxDirect: make };
  return { emulators, booted, pressed, exits: () => exits };
}

controllerContract('BrowserJsDos (on a fake js-dos)', {
  make: async () =>
    new BrowserJsDos({ emulators: fakeJsDos().emulators, keyDelayMs: 0, callTimeoutMs: 200 }),
  bundle,
  files: FILES,
});

describe('BrowserJsDos', () => {
  it('boots with the speed and the DOS clock in the config', async () => {
    const js = fakeJsDos();
    const c = new BrowserJsDos({ emulators: js.emulators, keyDelayMs: 0 });
    await c.boot(bundle, { cycles: 40000, dosTime: '1998-07-15 10:00:00' });
    const conf = strFromU8(unzipSync(js.booted[0]!)['.jsdos/dosbox.conf']!);
    expect(conf).toContain('cycles=fixed 40000');
    expect(conf).toContain('date 07-15-1998');
  });

  it('presses keys with the js-dos codes, one press at a time', async () => {
    const js = fakeJsDos();
    const c = new BrowserJsDos({ emulators: js.emulators, keyDelayMs: 0 });
    await c.boot(bundle);
    await c.sendKeys('2{PgDn}P{Alt+X}');
    expect(js.pressed).toEqual([[50], [267], [340, 80], [342, 88]]);
  });

  it('a missing file is NO_FILE at once, not a hang (js-dos never answers for it)', async () => {
    const c = new BrowserJsDos({
      emulators: fakeJsDos().emulators,
      keyDelayMs: 0,
      callTimeoutMs: 60_000,
    });
    await c.boot(bundle);
    const t0 = Date.now();
    await expect(c.readFile('NOPE.DBF')).rejects.toMatchObject({ code: 'NO_FILE' });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('a call js-dos never answers fails with TIMEOUT', async () => {
    const js = fakeJsDos();
    const stuck: JsDosEmulators = {
      ...js.emulators,
      dosboxWorker: async (init) => ({
        ...(await js.emulators.dosboxWorker(init)),
        screenshot: () => new Promise(() => {}),
      }),
    };
    const c = new BrowserJsDos({ emulators: stuck, keyDelayMs: 0, callTimeoutMs: 50 });
    await c.boot(bundle);
    await expect(c.screenshot()).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('a screenshot right after boot waits for the first frame (js-dos: "No frame received")', async () => {
    const js = fakeJsDos();
    let tries = 0;
    const early: JsDosEmulators = {
      ...js.emulators,
      dosboxWorker: async (init) => {
        const ci = await js.emulators.dosboxWorker(init);
        return {
          ...ci,
          screenshot: () =>
            ++tries < 3 ? Promise.reject(new Error('No frame received')) : ci.screenshot(),
        };
      },
    };
    const c = new BrowserJsDos({ emulators: early, keyDelayMs: 0, callTimeoutMs: 2000 });
    await c.boot(bundle);
    expect((await c.screenshot()).width).toBe(640);
    expect(tries).toBe(3);
  });

  it('other screenshot errors are not retried', async () => {
    const js = fakeJsDos();
    const broken: JsDosEmulators = {
      ...js.emulators,
      dosboxWorker: async (init) => ({
        ...(await js.emulators.dosboxWorker(init)),
        screenshot: () => Promise.reject(new Error('canvas lost')),
      }),
    };
    const c = new BrowserJsDos({ emulators: broken, keyDelayMs: 0 });
    await c.boot(bundle);
    await expect(c.screenshot()).rejects.toThrow('canvas lost');
  });

  it('setSpeed applies at the next reset (js-dos cannot change cycles while running)', async () => {
    const js = fakeJsDos();
    const c = new BrowserJsDos({ emulators: js.emulators, keyDelayMs: 0 });
    await c.boot(bundle);
    await c.setSpeed(90000);
    expect(js.booted).toHaveLength(1);
    await c.reset();
    expect(strFromU8(unzipSync(js.booted[1]!)['.jsdos/dosbox.conf']!)).toContain(
      'cycles=fixed 90000',
    );
    expect(js.exits()).toBe(1);
  });

  it('restoreState boots the program again on the saved files', async () => {
    const js = fakeJsDos();
    const c = new BrowserJsDos({ emulators: js.emulators, keyDelayMs: 0 });
    await c.boot(bundle);
    await c.writeFile('BILLS.DBF', new Uint8Array([1]));
    const state = await c.snapshotState();
    await c.restoreState(state);
    expect(js.booted).toHaveLength(2);
    expect(unzipSync(js.booted[1]!)['BILLS.DBF']).toEqual(new Uint8Array([1]));
  });
});

describe('flattenTree', () => {
  it('lists the files as DOS paths, without .jsdos', () => {
    const tree: JsDosFsNode = {
      name: '.',
      size: null,
      nodes: [
        { name: '.jsdos', size: null, nodes: [{ name: 'dosbox.conf', size: 229, nodes: null }] },
        { name: 'Shifa.exe', size: 2, nodes: null },
        { name: 'DATA', size: null, nodes: [{ name: 'bills.dbf', size: 5, nodes: null }] },
      ],
    };
    expect(flattenTree(tree)).toEqual([
      { dos: 'DATA/BILLS.DBF', path: 'DATA/bills.dbf', size: 5 },
      { dos: 'SHIFA.EXE', path: 'Shifa.exe', size: 2 },
    ]);
  });
});
