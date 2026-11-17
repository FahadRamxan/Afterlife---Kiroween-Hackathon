/// <reference lib="dom" />
// pnpm screen:capture (Prompt 22). Runs the real js-dos v8 in headless Chromium and records:
// 1. The VGA ROM fonts (8x16 and 8x8) as the emulator draws them, into packages/screen/src/vga-font.ts.
//    A tiny hand-assembled .COM writes characters 0-255 to video memory; each glyph is read off
//    the screenshot.
// 2. Screenshots of the three sample apps (both js-dos backends: DOSBox 640x400 and DOSBox-X
//    720x400) at screens that also have a DOSBox memory dump in samples/graveyard/fixtures. The
//    decoder tests compare the two: pixels from js-dos, text and colours from DOSBox's memory.
// Review the diff, then commit. The DOS clock is fixed with DATE/TIME in the autoexec.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { buildBundle } from '@afterlife/emulator';
import { chromium, type Page } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const ROOT = resolve(__dirname, '..');
const EMU = resolve(ROOT, 'packages/emulator/node_modules/js-dos/dist/emulators');
const OUT = resolve(ROOT, 'packages/screen/fixtures');
const BACKENDS = ['dosboxDirect', 'dosboxXDirect'] as const;
type Backend = (typeof BACKENDS)[number];

// js-dos key codes (GLFW numbering, from js-dos's own key table).
const KEY: Record<string, number> = {
  Enter: 257,
  Esc: 256,
  Tab: 258,
  Backspace: 259,
  Right: 262,
  Left: 263,
  Down: 264,
  Up: 265,
  PgUp: 266,
  PgDn: 267,
};
const SHIFT = 340;

/** "2{PgDn}P003{Enter}" -> key presses. Upper-case letters are typed with Shift. */
function keyPresses(seq: string): number[][] {
  const out: number[][] = [];
  for (const m of seq.matchAll(/\{(\w+)\}|(.)/g)) {
    if (m[1]) {
      const k = KEY[m[1]];
      if (!k) throw new Error(`screen-capture: unknown key {${m[1]}}`);
      out.push([k]);
    } else {
      const c = m[2]!;
      if (/[A-Z]/.test(c)) out.push([SHIFT, c.charCodeAt(0)]);
      else if (/[a-z]/.test(c)) out.push([c.toUpperCase().charCodeAt(0)]);
      else out.push([c.charCodeAt(0)]);
    }
  }
  return out;
}

/** The parts of js-dos's CommandInterface used here (see js-dos/dist/emulators/types). */
type Ci = {
  exit(): Promise<void>;
  simulateKeyPress(...codes: number[]): void;
  screenshot(): Promise<ImageData>;
};
type EmuWindow = {
  emulators: { pathPrefix: string } & Record<Backend, (bundle: Uint8Array) => Promise<Ci>>;
  ci?: Ci;
};

const TYPES: Record<string, string> = { '.js': 'text/javascript', '.wasm': 'application/wasm' };

async function openPage(): Promise<{ page: Page; close: () => Promise<void> }> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.route('http://emu.local/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/')
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>emu</title>' });
    const file = join(EMU, url.pathname.replace(/^\/emu\//, ''));
    return route.fulfill({
      body: readFileSync(file),
      contentType: TYPES[extname(file)] ?? 'application/octet-stream',
    });
  });
  await page.goto('http://emu.local/');
  await page.addScriptTag({ url: 'http://emu.local/emu/emulators.js' });
  return { page, close: () => browser.close() };
}

/** Sets the DOS clock in the bundle's autoexec, before the program starts. */
function withClock(bundle: Uint8Array, dosTime: string, backend: Backend): Uint8Array {
  const [date, time] = dosTime.split(' ') as [string, string];
  const [y, m, d] = date.split('-');
  const files = unzipSync(bundle);
  const conf = strFromU8(files['.jsdos/dosbox.conf']!);
  // DOSBox-X ignores DATE in every form tried (07-15-1998, 7-15-98, 1998-07-15, with or without
  // TIME) and always shows 24/07/98, so it gets no clock; the decoder tests skip its 8 date cells.
  const clock = backend === 'dosboxXDirect' ? '' : `time ${time}\ndate ${m}-${d}-${y}\n`;
  files['.jsdos/dosbox.conf'] = strToU8(conf.replace('mount c .\nc:\n', `mount c .\nc:\n${clock}`));
  return zipSync(files);
}

async function boot(page: Page, bundle: Uint8Array, backend: Backend) {
  await page.evaluate(
    async ([bytes, b]) => {
      const w = window as unknown as EmuWindow;
      if (w.ci) await w.ci.exit();
      w.emulators.pathPrefix = '/emu/';
      w.ci = await w.emulators[b](new Uint8Array(bytes));
    },
    [Array.from(bundle), backend] as const,
  );
}

async function press(page: Page, seq: string) {
  for (const codes of keyPresses(seq)) {
    await page.evaluate((c) => (window as unknown as EmuWindow).ci!.simulateKeyPress(...c), codes);
    await page.waitForTimeout(120);
  }
}

/** The emulator's own frame (not the page), as PNG bytes, plus its RGBA. */
async function screenshot(page: Page) {
  const r = await page.evaluate(async () => {
    const img = await (window as unknown as EmuWindow).ci!.screenshot();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')!.putImageData(img, 0, 0);
    return {
      width: img.width,
      height: img.height,
      rgba: Array.from(img.data),
      png: c.toDataURL('image/png').split(',')[1]!,
    };
  });
  return { ...r, rgba: new Uint8Array(r.rgba), png: Buffer.from(r.png, 'base64') };
}

// FONT.COM, hand-assembled (NASM syntax). With LOAD8 first, the 8x8 font and 50 lines.
//   [LOAD8: mov ax,1112h / xor bl,bl / int 10h]
//   mov ax,0B800h / mov es,ax / xor di,di      ; video memory
//   mov ax,0700h / mov cx,256                  ; char 0, grey on black, 256 cells
// L: stosw / inc al / loop L
//   mov ah,1 / mov cx,2000h / int 10h          ; hide the cursor
//   jmp $                                      ; stay on screen
const LOAD8 = [0xb8, 0x12, 0x11, 0x30, 0xdb, 0xcd, 0x10];
const TABLE = [
  0xb8, 0x00, 0xb8, 0x8e, 0xc0, 0x31, 0xff, 0xb8, 0x00, 0x07, 0xb9, 0x00, 0x01, 0xab, 0xfe, 0xc0,
  0xe2, 0xfb, 0xb4, 0x01, 0xb9, 0x00, 0x20, 0xcd, 0x10, 0xeb, 0xfe,
];

async function captureFont(page: Page, height: 16 | 8): Promise<Uint8Array> {
  const com = new Uint8Array(height === 8 ? [...LOAD8, ...TABLE] : TABLE);
  await boot(
    page,
    buildBundle({ executable: 'FONT.COM', files: { 'FONT.COM': com } }),
    'dosboxDirect',
  );
  await page.waitForTimeout(2500);
  const shot = await screenshot(page);
  if (shot.width !== 640 || shot.height !== 400)
    throw new Error(`font: ${shot.width}x${shot.height}`);
  const glyphs = new Uint8Array(256 * height);
  for (let ch = 0; ch < 256; ch++) {
    const row = Math.floor(ch / 80);
    const col = ch % 80;
    for (let y = 0; y < height; y++) {
      let bits = 0;
      for (let x = 0; x < 8; x++) {
        const p = ((row * height + y) * 640 + col * 8 + x) * 4;
        // Grey (AAAAAA) on black: any lit pixel is foreground.
        if (shot.rgba[p]! > 0x40) bits |= 0x80 >> x;
      }
      glyphs[ch * height + y] = bits;
    }
  }
  return glyphs;
}

type Capture = { app: string; scr: string; keys: string };
const CAPTURES: Capture[] = [
  { app: 'shifa', scr: 'menu/MENU', keys: '' },
  { app: 'shifa', scr: 'stock/STOCK1', keys: '2' },
  { app: 'shifa', scr: 'stock/STOCK2', keys: '2{PgDn}' },
  { app: 'shifa', scr: 'customers/CUSTS', keys: '3' },
  { app: 'shifa', scr: 'expired/EXPIRED', keys: '1{Enter}SEP200{Enter}' },
  {
    app: 'shifa',
    scr: 'bill-small/LINES',
    keys: '1{Enter}PAN500{Enter}4{Enter}BRU400{Enter}2{Enter}',
  },
  { app: 'iqra', scr: 'menu/MENU', keys: '' },
  { app: 'iqra', scr: 'menu/MENU2', keys: '{Down}' },
  { app: 'iqra', scr: 'students/STU1', keys: '{Down}{Enter}' },
  { app: 'iqra', scr: 'schedule/SCHEDULE', keys: '{Down}{Down}{Enter}' },
  { app: 'barkat', scr: 'menu/MENU', keys: '' },
  { app: 'barkat', scr: 'balances/BAL1', keys: 'B' },
  { app: 'barkat', scr: 'ledger/LEDGER', keys: 'LP003{Enter}' },
];

function dosTime(app: string): string {
  const env = readFileSync(resolve(ROOT, `samples/graveyard/${app}/build.env`), 'utf8');
  return /^DOS_TIME="([^"]+)"/m.exec(env)?.[1] ?? '1998-07-15 10:00:00';
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

async function main() {
  const { page, close } = await openPage();
  try {
    const f16 = await captureFont(page, 16);
    const f8 = await captureFont(page, 8);
    writeFileSync(
      resolve(ROOT, 'packages/screen/src/vga-font.ts'),
      [
        '// Generated by `pnpm screen:capture` (scripts/screen-capture.ts). Do not edit.',
        '// The VGA ROM fonts exactly as js-dos v8 draws them: 256 glyphs, one byte per pixel row,',
        '// most significant bit on the left. Read off the emulator screen, not copied from a file.',
        `export const FONT_8X16 = '${b64(f16)}';`,
        `export const FONT_8X8 = '${b64(f8)}';`,
        '',
      ].join('\n'),
    );
    console.log('fonts: 8x16 and 8x8 written');

    mkdirSync(OUT, { recursive: true });
    const index: (Capture & { backend: Backend; png: string; width: number; height: number })[] =
      [];
    for (const backend of BACKENDS) {
      for (const c of CAPTURES) {
        const bundle = readFileSync(resolve(ROOT, `apps/web/public/graveyard/${c.app}.jsdos`));
        await boot(page, withClock(new Uint8Array(bundle), dosTime(c.app), backend), backend);
        await page.waitForTimeout(2500);
        await press(page, c.keys);
        await page.waitForTimeout(1500);
        const shot = await screenshot(page);
        const png = `${c.app}-${c.scr.replace('/', '-').toLowerCase()}-${shot.width}.png`;
        writeFileSync(join(OUT, png), shot.png);
        index.push({ ...c, backend, png, width: shot.width, height: shot.height });
        console.log(`${backend} ${c.app} ${c.scr}: ${png}`);
      }
    }
    writeFileSync(join(OUT, 'captures.json'), JSON.stringify(index, null, 2) + '\n');
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
