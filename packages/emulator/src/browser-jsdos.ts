// BrowserJsDos (Prompt 27): EmulatorController on js-dos v8 in a browser page. The js-dos
// `emulators` object is passed in (window.emulators once emulators.js is loaded), so this file has
// no browser globals and its logic is tested in Node on a fake js-dos.
import { prepareBundle } from './bundle';
import {
  EmulatorError,
  checkCycles,
  dosDir,
  dosPath,
  type BootOptions,
  type EmulatorController,
  type EmulatorState,
  type Screenshot,
} from './controller';
import { jsdosKeys, parseKeys, type KeyStroke } from './keys';

/** js-dos's file tree node (protocol.d.ts in js-dos/dist/emulators/types). */
export type JsDosFsNode = { name: string; size: number | null; nodes: JsDosFsNode[] | null };

/** The parts of js-dos's CommandInterface this controller uses. */
export type JsDosCi = {
  fsTree(): Promise<JsDosFsNode>;
  fsReadFile(path: string): Promise<Uint8Array>;
  fsWriteFile(path: string, contents: Uint8Array): Promise<void>;
  screenshot(): Promise<{ width: number; height: number; data: Uint8ClampedArray | Uint8Array }>;
  /** In a headless page it resolves once the press has reached the emulator. */
  simulateKeyPress(...keyCodes: number[]): void | Promise<void>;
  exit(): Promise<void>;
};

export type JsDosEmulators = {
  dosboxWorker(init: Uint8Array): Promise<JsDosCi>;
  dosboxDirect(init: Uint8Array): Promise<JsDosCi>;
};

export type BrowserJsDosOptions = {
  emulators: JsDosEmulators;
  /** Web worker (default: the page stays responsive) or the page's own thread. */
  backend?: 'dosboxWorker' | 'dosboxDirect';
  /** Pause after each key press, so the DOS program reads every key (default 100 ms). */
  keyDelayMs?: number;
  /** Longest wait for any js-dos call (default 10 s). */
  callTimeoutMs?: number;
};

/** Files on drive C: from js-dos's tree: DOS path, the path js-dos uses, size. Sorted. */
export function flattenTree(root: JsDosFsNode): { dos: string; path: string; size: number }[] {
  const out: { dos: string; path: string; size: number }[] = [];
  const walk = (node: JsDosFsNode, prefix: string) => {
    for (const child of node.nodes ?? []) {
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      if (!prefix && child.name === '.jsdos') continue;
      if (child.nodes) walk(child, path);
      else out.push({ dos: path.toUpperCase(), path, size: child.size ?? 0 });
    }
  };
  walk(root, '');
  return out.sort((a, b) => (a.dos < b.dos ? -1 : a.dos > b.dos ? 1 : 0));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BrowserJsDos implements EmulatorController {
  private ci: JsDosCi | null = null;
  private pristine: Uint8Array | null = null;
  private options: BootOptions = {};
  private readonly backend: 'dosboxWorker' | 'dosboxDirect';
  private readonly keyDelayMs: number;
  private readonly callTimeoutMs: number;

  constructor(private readonly opts: BrowserJsDosOptions) {
    this.backend = opts.backend ?? 'dosboxWorker';
    this.keyDelayMs = opts.keyDelayMs ?? 100;
    this.callTimeoutMs = opts.callTimeoutMs ?? 10_000;
  }

  /** Every js-dos call goes through here: js-dos may never answer (a missing file in the worker). */
  private call<T>(what: string, p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new EmulatorError(
              'TIMEOUT',
              `js-dos did not answer ${what} in ${this.callTimeoutMs} ms`,
            ),
          ),
        this.callTimeoutMs,
      );
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  private running(): JsDosCi {
    if (!this.ci) throw new EmulatorError('NOT_BOOTED', 'Boot a bundle first');
    return this.ci;
  }

  private async start(bundle: Uint8Array): Promise<void> {
    if (this.ci) await this.call('exit', this.ci.exit());
    this.ci = null;
    this.ci = await this.call('boot', this.opts.emulators[this.backend](bundle));
  }

  async boot(bundle: Uint8Array, options: BootOptions = {}): Promise<void> {
    if (options.cycles !== undefined) checkCycles(options.cycles);
    let prepared: Uint8Array;
    try {
      prepared = prepareBundle(bundle, options);
    } catch (e) {
      throw new EmulatorError('BAD_BUNDLE', (e as Error).message);
    }
    this.pristine = bundle.slice();
    this.options = { ...options };
    await this.start(prepared);
  }

  /**
   * Presses the keys one by one, keyDelayMs apart. The DOS keyboard buffer holds 15 keys, so a
   * slow program can lose keys typed far ahead of it: send one action, then wait for the screen.
   */
  async sendKeys(keys: string | KeyStroke[]): Promise<void> {
    const ci = this.running();
    const presses = jsdosKeys(typeof keys === 'string' ? parseKeys(keys) : keys);
    for (const codes of presses) {
      // Wait for the press to arrive before the gap starts: a busy page would otherwise get the
      // presses queued behind it back to back, and DOS drops keys that come with no gap.
      await ci.simulateKeyPress(...codes);
      await sleep(this.keyDelayMs);
    }
  }

  /** Right after boot js-dos has no frame yet ("No frame received"): wait for the first one. */
  async screenshot(): Promise<Screenshot> {
    const end = Date.now() + this.callTimeoutMs;
    for (;;) {
      try {
        const img = await this.call('screenshot', this.running().screenshot());
        return { width: img.width, height: img.height, rgba: new Uint8Array(img.data) };
      } catch (e) {
        if (!/No frame received/.test((e as Error).message) || Date.now() >= end) throw e;
        await sleep(50);
      }
    }
  }

  private async files() {
    return flattenTree(await this.call('fsTree', this.running().fsTree()));
  }

  async readFile(path: string): Promise<Uint8Array> {
    const dos = dosPath(path);
    const file = (await this.files()).find((f) => f.dos === dos);
    // Look first: js-dos never answers a read of a missing file in the worker.
    if (!file) throw new EmulatorError('NO_FILE', `No file ${dos} on drive C:`);
    return new Uint8Array(await this.call(`read ${dos}`, this.running().fsReadFile(file.path)));
  }

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    const dos = dosPath(path);
    const existing = (await this.files()).find((f) => f.dos === dos);
    await this.call(
      `write ${dos}`,
      this.running().fsWriteFile(existing?.path ?? dos, bytes.slice()),
    );
  }

  async listFiles(dir?: string): Promise<string[]> {
    const d = dosDir(dir);
    return (await this.files())
      .map((f) => f.dos)
      .filter((p) =>
        d === '' ? !p.includes('/') : p.startsWith(`${d}/`) && !p.slice(d.length + 1).includes('/'),
      );
  }

  /** js-dos cannot change the speed of a running program: it applies from the next reset. */
  async setSpeed(cycles: number): Promise<void> {
    this.running();
    this.options = { ...this.options, cycles: checkCycles(cycles) };
  }

  async reset(): Promise<void> {
    this.running();
    await this.start(prepareBundle(this.pristine!, this.options));
  }

  async snapshotState(): Promise<EmulatorState> {
    const files: Record<string, Uint8Array> = {};
    for (const f of await this.files())
      files[f.dos] = new Uint8Array(
        await this.call(`read ${f.dos}`, this.running().fsReadFile(f.path)),
      );
    return { files };
  }

  /** Boots the program again on the saved files (js-dos cannot save the CPU and memory). */
  async restoreState(state: EmulatorState): Promise<void> {
    this.running();
    const files = Object.fromEntries(Object.entries(state.files).map(([k, v]) => [dosPath(k), v]));
    await this.start(prepareBundle(this.pristine!, { ...this.options, files }));
  }

  async exit(): Promise<void> {
    const ci = this.ci;
    this.ci = null;
    this.pristine = null;
    if (ci) await this.call('exit', ci.exit());
  }
}
