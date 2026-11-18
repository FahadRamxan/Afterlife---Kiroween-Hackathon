/// <reference lib="dom" />
// HeadlessJsDos (Prompt 28): the same js-dos and the same BrowserJsDos logic as the web app, in a
// headless Chromium page. Only js-dos runs in the page; each js-dos call crosses page.evaluate.
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import {
  BrowserJsDos,
  type BrowserJsDosOptions,
  type JsDosCi,
  type JsDosEmulators,
  type JsDosFsNode,
} from '@afterlife/emulator';
import { chromium, type Browser, type Page } from 'playwright';
import { Pool } from './pool';

const require = createRequire(import.meta.url);
const EMU = join(
  realpathSync(dirname(require.resolve('js-dos/package.json'))),
  'dist',
  'emulators',
);
const ORIGIN = 'http://jsdos.local';
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.wasm': 'application/wasm' };

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

/** A blank page that has loaded js-dos, served from the js-dos package (no network). */
export async function openJsDosPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  // tsx names functions with a __name helper; code sent to the page needs it too.
  await page.addInitScript('window.__name = (f) => f;');
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>js-dos</title>',
      });
    const file = join(EMU, path.replace(/^\/js-dos\//, ''));
    if (!path.startsWith('/js-dos/') || !file.startsWith(EMU))
      return route.fulfill({ status: 404 });
    return route.fulfill({
      body: readFileSync(file),
      contentType: TYPES[extname(file)] ?? 'application/octet-stream',
    });
  });
  await page.goto(`${ORIGIN}/`);
  await page.addScriptTag({ url: `${ORIGIN}/js-dos/emulators.js` });
  await page.evaluate(() => {
    (window as unknown as { emulators: { pathPrefix: string } }).emulators.pathPrefix = '/js-dos/';
  });
  return page;
}

type Ci = {
  fsTree(): Promise<JsDosFsNode>;
  fsReadFile(path: string): Promise<Uint8Array>;
  fsWriteFile(path: string, data: Uint8Array): Promise<void>;
  screenshot(): Promise<ImageData>;
  simulateKeyPress(...codes: number[]): void;
  exit(): Promise<void>;
};
type PageWindow = {
  emulators: Record<'dosboxWorker' | 'dosboxDirect', (init: Uint8Array) => Promise<Ci>>;
  cis?: Record<number, Ci>;
};

/** js-dos's `emulators` in that page, as seen from Node. Bytes cross as base64. */
export function pageEmulators(page: Page): JsDosEmulators {
  let next = 0;
  const start = async (
    backend: 'dosboxWorker' | 'dosboxDirect',
    init: Uint8Array,
  ): Promise<JsDosCi> => {
    const id = ++next;
    await page.evaluate(
      async ([b, data, n]) => {
        const w = window as unknown as PageWindow;
        w.cis ??= {};
        w.cis[n] = await w.emulators[b](Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      },
      [backend, b64(init), id] as const,
    );
    return {
      fsTree: () => page.evaluate((n) => (window as unknown as PageWindow).cis![n]!.fsTree(), id),
      fsReadFile: async (path) =>
        unb64(
          await page.evaluate(
            async ([n, p]) => {
              const bytes = await (window as unknown as PageWindow).cis![n]!.fsReadFile(p);
              let s = '';
              for (let i = 0; i < bytes.length; i += 0x8000)
                s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
              return btoa(s);
            },
            [id, path] as const,
          ),
        ),
      fsWriteFile: async (path, contents) => {
        await page.evaluate(
          ([n, p, d]) =>
            (window as unknown as PageWindow).cis![n]!.fsWriteFile(
              p,
              Uint8Array.from(atob(d), (c) => c.charCodeAt(0)),
            ),
          [id, path, b64(contents)] as const,
        );
      },
      screenshot: async () => {
        const r = await page.evaluate(async (n) => {
          const img = await (window as unknown as PageWindow).cis![n]!.screenshot();
          let s = '';
          for (let i = 0; i < img.data.length; i += 0x8000)
            s += String.fromCharCode(...img.data.subarray(i, i + 0x8000));
          return { width: img.width, height: img.height, data: btoa(s) };
        }, id);
        return { width: r.width, height: r.height, data: unb64(r.data) };
      },
      // Playwright runs evaluations on one page in order, so presses arrive in order.
      simulateKeyPress: (...codes) => {
        page
          .evaluate(([n, c]) => (window as unknown as PageWindow).cis![n]!.simulateKeyPress(...c), [
            id,
            codes,
          ] as const)
          .catch(() => {});
      },
      exit: async () => {
        await page.evaluate(async (n) => {
          const w = window as unknown as PageWindow;
          await w.cis![n]!.exit();
          delete w.cis![n];
        }, id);
      },
    };
  };
  return {
    dosboxWorker: (init) => start('dosboxWorker', init),
    dosboxDirect: (init) => start('dosboxDirect', init),
  };
}

/** EmulatorController on js-dos in a headless Chromium page. */
export class HeadlessJsDos extends BrowserJsDos {
  constructor(
    readonly page: Page,
    options: Omit<BrowserJsDosOptions, 'emulators'> = {},
  ) {
    super({ ...options, emulators: pageEmulators(page) });
  }
}

export type HeadlessPoolOptions = {
  /** Most emulators at once (JSDOS_POOL_SIZE). */
  size: number;
  /** DOSBox speed for every boot from this pool (JSDOS_CYCLES); tests run faster than real time. */
  cycles: number;
  keyDelayMs?: number;
};

/**
 * Up to `size` headless emulators sharing one Chromium. Each acquire is a fresh page; release
 * closes it. `use` boots a bundle at the pool's speed (unless the caller sets one).
 */
export class HeadlessPool {
  private browser: Promise<Browser> | null = null;
  private readonly pool: Pool<HeadlessJsDos>;

  constructor(private readonly opts: HeadlessPoolOptions) {
    this.pool = new Pool({
      size: opts.size,
      create: async () => {
        this.browser ??= chromium.launch();
        const page = await openJsDosPage(await this.browser);
        return new HeadlessJsDos(page, { keyDelayMs: opts.keyDelayMs });
      },
      destroy: async (emu) => {
        await emu.exit().catch(() => {});
        await emu.page.close();
      },
    });
  }

  get waiting(): number {
    return this.pool.waiting;
  }

  /** Boots `bundle` on a free emulator, runs `work`, then frees the emulator. */
  use<R>(
    bundle: Uint8Array,
    work: (emu: HeadlessJsDos) => Promise<R>,
    boot: { cycles?: number; dosTime?: string } = {},
  ): Promise<R> {
    return this.pool.use(async (emu) => {
      await emu.boot(bundle, { cycles: this.opts.cycles, ...boot });
      return work(emu);
    });
  }

  acquire(): Promise<HeadlessJsDos> {
    return this.pool.acquire();
  }

  release(emu: HeadlessJsDos): Promise<void> {
    return this.pool.release(emu);
  }

  async close(): Promise<void> {
    await this.pool.close();
    const b = this.browser;
    this.browser = null;
    if (b) await (await b).close();
  }
}
