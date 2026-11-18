// Copies the js-dos v8 emulator (the DOSBox WebAssembly build and its loader) into public/js-dos,
// so the browser loads it from this site. Runs before `next dev` and `next build`. The files are
// not committed: they come from the pinned js-dos package (GPL-2.0, used unmodified).
import { copyFileSync, mkdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = realpathSync(dirname(require.resolve('js-dos/package.json')));
const from = join(pkg, 'dist', 'emulators');
const to = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'js-dos');
// emulators.js loads wdosbox.js and wdosbox.wasm (the DOSBox build both backends use).
const FILES = ['emulators.js', 'wdosbox.js', 'wdosbox.wasm'];

mkdirSync(to, { recursive: true });
for (const f of FILES) copyFileSync(join(from, f), join(to, f));
console.log(`js-dos: copied ${FILES.length} files to public/js-dos`);
