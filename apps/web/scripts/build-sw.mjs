// Builds the reborn app's service worker (Prompt 60): app/sw.ts, with Serwist, bundled into
// public/sw.js. Runs before `next dev` and `next build`, outside Next: built inside Next's
// compiler, the worker was rewritten on every dev compile and the dev server kept reloading.
// There is no build-time precache list: the Vessel page puts its own shell in the cache.
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [join(root, 'app', 'sw.ts')],
  outfile: join(root, 'public', 'sw.js'),
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: process.argv.includes('--minify'),
  define: { 'self.__SW_MANIFEST': '[]' },
  logLevel: 'warning',
});
console.log('service worker: built public/sw.js');
