// Boots the real Shifa EXE in headless js-dos, `count` emulators at once, and waits for its main
// menu on each. The Docker smoke test runs this inside the worker image (pnpm ci:local) to prove
// the image can run Chromium, and measures the memory it takes.
//   node --import tsx src/smoke-boot.ts [count] [holdMs]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForStableScreen } from '@afterlife/emulator';
import { HeadlessPool } from '@afterlife/emulator/headless';

const SHIFA = fileURLToPath(new URL('../../web/public/graveyard/shifa.jsdos', import.meta.url));

export async function smokeBoot({
  count = 1,
  holdMs = 0,
  log = console.log,
}: { count?: number; holdMs?: number; log?: (l: string) => void } = {}): Promise<string[]> {
  const bundle = new Uint8Array(readFileSync(SHIFA));
  const pool = new HeadlessPool({ size: count, cycles: 60000 });
  try {
    const firstLines = await Promise.all(
      Array.from({ length: count }, () =>
        pool.use(bundle, async (emu) => {
          const r = await waitForStableScreen(emu, {
            maxWaitMs: 60_000,
            until: (s) => s.text.some((l) => l.includes('MAIN MENU')),
          });
          if (!r.stable)
            throw new Error(`no MAIN MENU; the screen was:\n${r.screen.text.join('\n')}`);
          // Print once all are up, and hold them so the memory of `count` emulators can be read.
          log(`BOOTED ${r.screen.text[0]!.trim()}`);
          await new Promise((res) => setTimeout(res, holdMs));
          return r.screen.text[0]!.trim();
        }),
      ),
    );
    log(`SMOKE BOOT OK ${count}`);
    return firstLines;
  } finally {
    await pool.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [count, hold] = process.argv.slice(2).map(Number);
  smokeBoot({ count: count || 1, holdMs: hold || 0 }).catch((e) => {
    console.error(`SMOKE BOOT FAILED ${(e as Error).message}`);
    process.exit(1);
  });
}
