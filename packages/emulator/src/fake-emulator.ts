// An in-memory EmulatorController for tests (no WebAssembly, no browser). A test scripts the
// old app's behaviour with onKeys: it sees each sequence and may change files and the screen.
import { unzipSync } from 'fflate';
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
import { parseKeys, type KeyStroke } from './keys';

export type FakeApp = {
  /** Called for every sendKeys, after parsing. */
  onKeys?: (keys: KeyStroke[], app: FakeAppApi) => void;
  /** The first screen after boot. Default: black 640x400. */
  screen?: Screenshot;
};

export type FakeAppApi = {
  files: Map<string, Uint8Array>;
  setScreen: (s: Screenshot) => void;
};

const black = (): Screenshot => ({
  width: 640,
  height: 400,
  rgba: new Uint8Array(640 * 400 * 4).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 0)),
});

const copyFiles = (files: Map<string, Uint8Array> | Record<string, Uint8Array>) =>
  new Map(
    [...(files instanceof Map ? files : Object.entries(files))].map(([k, v]) => [k, v.slice()]),
  );

export class FakeEmulator implements EmulatorController {
  /** Every key sequence sent since boot, as parsed. */
  readonly log: KeyStroke[][] = [];
  cycles = 20000;
  dosTime: string | undefined;
  private pristine: Map<string, Uint8Array> | null = null;
  private files = new Map<string, Uint8Array>();
  private screen: Screenshot = black();

  constructor(private readonly app: FakeApp = {}) {}

  private booted(): void {
    if (!this.pristine) throw new EmulatorError('NOT_BOOTED', 'Boot a bundle first');
  }

  async boot(bundle: Uint8Array, options: BootOptions = {}): Promise<void> {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bundle);
    } catch {
      throw new EmulatorError('BAD_BUNDLE', 'The bundle is not a zip');
    }
    if (!entries['.jsdos/dosbox.conf'])
      throw new EmulatorError('BAD_BUNDLE', 'The bundle has no .jsdos/dosbox.conf');
    const files = new Map<string, Uint8Array>();
    for (const [name, bytes] of Object.entries(entries))
      if (!name.startsWith('.jsdos/') && !name.endsWith('/')) files.set(dosPath(name), bytes);
    this.cycles = checkCycles(options.cycles ?? 20000);
    this.dosTime = options.dosTime;
    this.pristine = files;
    await this.reset();
  }

  async sendKeys(keys: string | KeyStroke[]): Promise<void> {
    this.booted();
    const strokes = typeof keys === 'string' ? parseKeys(keys) : keys;
    this.log.push(strokes);
    this.app.onKeys?.(strokes, { files: this.files, setScreen: (s) => (this.screen = s) });
  }

  async screenshot(): Promise<Screenshot> {
    this.booted();
    return { ...this.screen, rgba: this.screen.rgba.slice() };
  }

  async readFile(path: string): Promise<Uint8Array> {
    this.booted();
    const bytes = this.files.get(dosPath(path));
    if (!bytes) throw new EmulatorError('NO_FILE', `No file ${dosPath(path)} on drive C:`);
    return bytes.slice();
  }

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.booted();
    this.files.set(dosPath(path), bytes.slice());
  }

  async listFiles(dir?: string): Promise<string[]> {
    this.booted();
    const d = dosDir(dir);
    return [...this.files.keys()]
      .filter((p) =>
        d === '' ? !p.includes('/') : p.startsWith(`${d}/`) && !p.slice(d.length + 1).includes('/'),
      )
      .sort();
  }

  async setSpeed(cycles: number): Promise<void> {
    this.booted();
    this.cycles = checkCycles(cycles);
  }

  async reset(): Promise<void> {
    this.booted();
    this.files = copyFiles(this.pristine!);
    this.screen = this.app.screen ?? black();
    this.log.length = 0;
  }

  async snapshotState(): Promise<EmulatorState> {
    this.booted();
    return { files: Object.fromEntries(copyFiles(this.files)) };
  }

  async restoreState(state: EmulatorState): Promise<void> {
    this.booted();
    this.files = new Map(Object.entries(state.files).map(([k, v]) => [dosPath(k), v.slice()]));
    this.screen = this.app.screen ?? black();
  }

  async exit(): Promise<void> {
    this.pristine = null;
    this.files = new Map();
  }
}
