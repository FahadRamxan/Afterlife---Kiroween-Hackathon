#!/usr/bin/env node
// afterlife-twin (Prompt 76): Ghost Twin's capture tool for a real shop PC. It watches the folder
// DOSBox mounts as C: and sends each change to the app's DBF files to Afterlife, which replays it
// in the reborn app and compares (Prompt 77). Run: pnpm twin --api ... --project ... --dir ...
import { existsSync } from 'node:fs';
import { createCapture } from './capture';
import { parseCli } from './cli-args';
import { httpPoster } from './http';

const parsed = parseCli(process.argv.slice(2), process.env);
if (!parsed.ok) {
  console.error(parsed.message);
  process.exit(2);
}
const o = parsed.options;
if (!existsSync(o.dir)) {
  console.error(`No folder ${o.dir}`);
  process.exit(2);
}
const capture = createCapture({
  dir: o.dir,
  intervalMs: o.intervalMs,
  post: httpPoster({ api: o.api, projectId: o.project, token: o.token }),
  log: (m) => console.log(`[${new Date().toISOString()}] ${m}`),
});
// Said once the first look is taken: a change from then on is sent.
await capture.start();
console.log(`afterlife-twin: watching ${o.dir} every ${o.intervalMs} ms for project ${o.project}`);
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    void capture.stop().then(() => {
      if (capture.pending()) console.log(`${capture.pending()} changes were not sent yet`);
      process.exit(0);
    });
  });
