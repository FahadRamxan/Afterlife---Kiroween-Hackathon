// pnpm twin:record (Prompt 77): a week in Shifa Medical Store, recorded from the real 1998 app in
// headless js-dos, for Ghost Twin's tests and its "simulate a day in the shop" (Prompt 79). Each day
// boots the app at that day's DOS clock on the files the day before left, and types the day's bills
// and new customers (cases an owner could type, made from the Soul of the app as it runs). After
// each one, the change it made to the data files is kept, as afterlife-twin would have sent it.
// The result, samples/graveyard/shifa/twin-week.json, is data the real app wrote, not made up.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEmptyDiff, snapshot, type SnapshotDiff } from '@afterlife/dbf';
import { HeadlessPool } from '@afterlife/emulator/headless';
import { emulatorOldApp, prepareCases, proofCases } from '@afterlife/oracle';
import { SHIFA_AS_IT_RUNS_SOUL as SOUL } from '@afterlife/soul/examples/shifa';
import { tablesFromBundle } from '@afterlife/vessel';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = new Uint8Array(
  readFileSync(path.join(ROOT, 'apps/web/public/graveyard/shifa.jsdos')),
);
const OUT = path.join(ROOT, 'samples/graveyard/shifa/twin-week.json');
const DAYS = Number(process.env.TWIN_DAYS ?? 7);
// Bills typed a day: some save nothing (every line refused as the day's stock runs low).
const PER_DAY = Number(process.env.TWIN_PER_DAY ?? 42);
const FIRST = '1998-07-15';

const dayOf = (k: number) => {
  const d = new Date(`${FIRST}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
};
const graph = {
  nodes: SOUL.screens.map((s) => ({ fingerprint: s.id, title: s.title, firstSeen: 0, visits: 1 })),
  edges: SOUL.screens.flatMap((s) =>
    s.navigation.map((n) => ({ from: s.id, to: n.to, keys: n.keys, count: 1 })),
  ),
};

type Recorded = {
  day: string;
  seq: number;
  occurredAt: string;
  files: string[];
  diff: SnapshotDiff;
};

async function main() {
  const pool = new HeadlessPool({ size: 1, cycles: 60_000, keyDelayMs: 50 });
  const events: Recorded[] = [];
  let files: Record<string, Uint8Array> | undefined;
  try {
    for (let k = 0; k < DAYS; k++) {
      const day = dayOf(k);
      // The day's cases, made from the records the day starts with.
      const start = files
        ? Object.fromEntries(
            Object.entries((await snapshot(files)).tables).map(([f, t]) => [
              f.split('/').at(-1)!,
              t.table.records,
            ]),
          )
        : Object.fromEntries(
            Object.entries(tablesFromBundle(BUNDLE, SOUL)).map(([f, t]) => [f, t.records]),
          );
      const ctx = await prepareCases(SOUL, start, { today: day });
      // Mostly bills; now and then a new customer (the 6th and the 21st of the day).
      const bills = await proofCases(ctx, {
        numRuns: PER_DAY,
        seed: 1998 + k,
        actionId: 'save-bill',
      });
      const customers = await proofCases(ctx, {
        numRuns: 2,
        seed: 1998 + k,
        actionId: 'add-customer',
      });
      const cases = [...bills];
      cases.splice(5, 0, customers[0]!);
      cases.splice(20, 0, customers[1]!);
      files = await pool.use(
        BUNDLE,
        async (emu) => {
          // The day starts on what the day before left (booted again on those files, at today's clock).
          if (files) await emu.restoreState({ files });
          let old = emulatorOldApp(emu, { soul: SOUL, graph });
          for (const [i, c] of cases.entries()) {
            const r = await old.run(c).catch(async (e: Error) => {
              console.log(`${day} case ${i}: could not be typed: ${e.message}`);
              // Left on a screen the graph cannot leave: boot the app again on the files as they
              // are (nothing half typed was saved), at the same clock.
              await emu.restoreState(await emu.snapshotState());
              old = emulatorOldApp(emu, { soul: SOUL, graph });
              return null;
            });
            if (!r || isEmptyDiff(r.effects)) continue;
            // Opening at nine, a transaction every few minutes.
            const at = new Date(`${day}T09:00:00Z`);
            at.setUTCMinutes(at.getUTCMinutes() + i * 15);
            events.push({
              day,
              seq: events.length + 1,
              occurredAt: at.toISOString(),
              files: [...new Set([...Object.keys(r.effects.tables)])].sort(),
              diff: r.effects,
            });
          }
          // What the day leaves on drive C: (the program and its data), for the next day.
          return (await emu.snapshotState()).files;
        },
        { dosTime: `${day} 09:00:00` },
      );
      console.log(`${day}: ${events.filter((e) => e.day === day).length} transactions`);
    }
  } finally {
    await pool.close();
  }
  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        app: 'shifa',
        source: 'pnpm twin:record (the real Shifa EXE in headless js-dos)',
        recordedAt: new Date().toISOString(),
        days: [...new Set(events.map((e) => e.day))],
        events,
      },
      null,
      1,
    )}\n`,
  );
  console.log(
    `twin:record: ${events.length} transactions over ${DAYS} days -> ${path.relative(ROOT, OUT)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
