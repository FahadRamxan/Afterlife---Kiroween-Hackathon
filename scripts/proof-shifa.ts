// pnpm proof:shifa (Prompt 68, a ci:local step): the Oracle's differential proof on the real Shifa
// Medical Store in headless js-dos, case by case against the Vessel.
//
// 1. The strict proof: 200 cases (PROOF_CASES) made up from the Soul of Shifa as the 1998 app really
//    runs (SHIFA_AS_IT_RUNS_SOUL, its two-digit-year expiry check included). Any difference fails,
//    and so does fewer than half the cases running (the rest skipped).
// 2. The known bug: 60 cases (PROOF_BUG_CASES) from the reference Soul, whose expiry check is the
//    intended one. The proof must find differences, and every one must be a bill with a batch good
//    until 2000 or later (the manifest's y2k-expiry): the proof catches what it should, and only that.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HeadlessPool } from '@afterlife/emulator/headless';
import {
  emulatorOldApp,
  proveEquivalence,
  type CaseResult,
  type OldApp,
  type ProofResult,
} from '@afterlife/oracle';
import type { Soul } from '@afterlife/soul';
import { SHIFA_AS_IT_RUNS_SOUL, SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { tablesFromBundle } from '@afterlife/vessel';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = new Uint8Array(
  readFileSync(path.join(ROOT, 'apps/web/public/graveyard/shifa.jsdos')),
);
const DOS_TIME = '1998-07-15 10:00:00';
const CASES = Number(process.env.PROOF_CASES ?? 200);
const BUG_CASES = Number(process.env.PROOF_BUG_CASES ?? 60);
const LANES = Number(process.env.PROOF_LANES ?? 4);
const SEED = Number(process.env.PROOF_SEED ?? 1998);

// The old app is driven by its screens and macros: the same in both Souls.
const OLD = SHIFA_AS_IT_RUNS_SOUL;
// The screen graph from the Soul's own navigation (the Possessor's map of the same app).
const graph = {
  nodes: OLD.screens.map((s) => ({ fingerprint: s.id, title: s.title, firstSeen: 0, visits: 1 })),
  edges: OLD.screens.flatMap((s) =>
    s.navigation.map((n) => ({ from: s.id, to: n.to, keys: n.keys, count: 1 })),
  ),
};
const records = Object.fromEntries(
  Object.entries(tablesFromBundle(BUNDLE, OLD)).map(([f, t]) => [f, t.records]),
);
const expiry = new Map(
  records['MEDICINE.DBF']!.map((r) => [String(r.values.CODE).trim(), String(r.values.EXPIRY)]),
);
const y2kLine = (c: CaseResult) =>
  (c.inputs.lines ?? []).some((l) => (expiry.get(l.CODE ?? '') ?? '') >= '20000101');

async function prove(pool: HeadlessPool, soul: Soul, numRuns: number, label: string) {
  const start = Date.now();
  let done = 0;
  const r = await proveEquivalence(
    {
      soul,
      records,
      today: DOS_TIME.slice(0, 10),
      withOldApp: <R>(work: (old: OldApp) => Promise<R>) =>
        pool.use(BUNDLE, (emu) => work(emulatorOldApp(emu, { soul: OLD, graph })), {
          dosTime: DOS_TIME,
        }),
    },
    {
      numRuns,
      seed: SEED,
      lanes: LANES,
      onCase: (c) => {
        done++;
        const what =
          c.outcome === 'fail'
            ? `DIFFERENT ${c.reason ?? JSON.stringify(c.differences)}`
            : c.outcome === 'skip'
              ? `skipped (${c.reason})`
              : 'same';
        console.log(
          `${label} case ${String(c.index).padStart(3)} lane ${c.lane} ${c.actionId} ` +
            `${JSON.stringify(c.inputs)}: ${what} (${c.ms} ms) [${done}/${numRuns}]`,
        );
      },
    },
  );
  const secs = Math.round((Date.now() - start) / 1000);
  console.log(
    `${label}: seed ${r.seed}, ${r.numRuns} cases on ${r.lanes} lanes, ${r.passed} same, ` +
      `${r.failed} different, ${r.skipped} skipped, in ${secs} s`,
  );
  return r;
}

async function main() {
  const pool = new HeadlessPool({ size: LANES, cycles: 60_000, keyDelayMs: 50 });
  const problems: string[] = [];
  try {
    const strict: ProofResult = await prove(pool, SHIFA_AS_IT_RUNS_SOUL, CASES, 'strict');
    if (strict.failed) problems.push(`the strict proof found ${strict.failed} differences`);
    if (strict.passed < strict.numRuns / 2)
      problems.push(`only ${strict.passed} of ${strict.numRuns} cases ran`);
    if (BUG_CASES > 0) {
      const bug = await prove(pool, SHIFA_REFERENCE_SOUL, BUG_CASES, 'y2k');
      const fails = bug.cases.filter((c) => c.outcome === 'fail');
      if (!fails.length) problems.push('the reference Soul was not caught differing (y2k-expiry)');
      const other = fails.filter((c) => !y2kLine(c));
      if (other.length)
        problems.push(
          `${other.length} differences are not the Y2K bug: cases ${other.map((c) => c.index)}`,
        );
      else if (fails.length)
        console.log(`y2k: all ${fails.length} differences are bills with a batch good until 2000+`);
    }
  } finally {
    await pool.close();
  }
  if (problems.length) {
    console.error(`proof:shifa FAILED: ${problems.join('; ')}`);
    process.exitCode = 1;
  } else console.log('proof:shifa PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
