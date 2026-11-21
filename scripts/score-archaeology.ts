// Archaeology scoring (Prompt 56): what the Archaeologist recovers of each sample app's hidden
// rules (manifest.json `knownRules`, with the truth our team wrote from the C source).
//
// For each sample: the entities from the app's data files and its recorded run
// (apps/worker/recorded: possession, and the probes the Archaeologist had typed into the old app),
// then the rules: short expressions the enumerator lists, plus, with a model set up
// (LLM_PROVIDER=bedrock), the model's candidates; the deterministic check keeps only those that
// explain every observation. The Soul is scored against the hidden truth, with the app's scripted
// scenario runs (samples/graveyard/fixtures) as the evidence for equivalence.
//
// Usage: pnpm score:archaeology           print the scores
//        pnpm score:archaeology --write   also update docs/archaeology-score.json and the README
// `tests/archaeology-score.test.ts` fails if the score without a model ever drops.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CrewLlm,
  MemoryLlmCallLog,
  detectEntities,
  inferRules,
  llmClientFrom,
  scoreSentence,
  scoreSoul,
  type EffectObservation,
  type LlmClient,
  type Score,
} from '@afterlife/crew';
import { readDbf, type SnapshotDiff } from '@afterlife/dbf';
import {
  graveyardEvidence,
  graveyardHidden,
} from '../packages/crew/src/archaeologist/testing/graveyard-runs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCORE_FILE = path.join(ROOT, 'docs', 'archaeology-score.json');
const README = path.join(ROOT, 'README.md');
/** What the Graveyard page shows: the numbers only, no hidden rule ids or texts. */
export const WEB_SCORE_FILE = path.join(ROOT, 'apps', 'web', 'lib', 'archaeology-score.json');
export const SAMPLES = ['shifa', 'iqra', 'barkat'] as const;
/** The score when no model is set up: entities, counters and the enumerated rules. */
export const NO_MODEL = 'no-model';

export type SampleScore = { app: string; name: string; observations: number; score: Score };
export type ScoreFile = Record<string, SampleScore[]>;

type Recording = {
  steps: { step: string; events: { type: string; payload: Record<string, unknown> }[] }[];
  observations?: { id: string; keys: string; dbfDiff: SnapshotDiff }[];
};

const recording = (app: string) =>
  JSON.parse(
    readFileSync(path.join(ROOT, 'apps', 'worker', 'recorded', `${app}.json`), 'utf8'),
  ) as Recording;

/** The observations of an app's recorded possession: each key step, with what it changed. */
export function recordedObservations(app: string): EffectObservation[] {
  const possess = recording(app).steps.find((s) => s.step === 'possess');
  return (possess?.events ?? [])
    .filter((e) => e.type === 'observation' && e.payload.diff)
    .map((e, i) => ({
      id: String(e.payload.id ?? `recorded-${i}`),
      keys: String(e.payload.keys ?? ''),
      screenBefore: {},
      dbfDiff: e.payload.diff as SnapshotDiff,
    }));
}

/**
 * Every observation of the recorded run, as the Archaeologist saw it: possession, then the probes
 * it had typed into the old app. Possession's alone when the recording kept no observations.
 */
export function recordedRun(app: string): EffectObservation[] {
  const kept = recording(app).observations;
  if (!kept?.length) return recordedObservations(app);
  return kept.map((o) => ({ id: o.id, keys: o.keys, screenBefore: {}, dbfDiff: o.dbfDiff }));
}

/**
 * A sample's data files, its recorded run and the entities found in it. As in the pipeline, the
 * entities come from possession (the probes come after them, each in a freshly booted app).
 */
export async function sampleInputs(app: string) {
  const manifest = JSON.parse(
    readFileSync(path.join(ROOT, 'samples', 'graveyard', app, 'manifest.json'), 'utf8'),
  ) as { name: string; dosTime: string };
  const dist = path.join(ROOT, 'samples', 'graveyard', 'dist', app);
  const tables = readdirSync(dist)
    .filter((f) => /\.DBF$/i.test(f))
    .sort()
    .map((f) => ({
      file: f.toUpperCase(),
      table: readDbf(new Uint8Array(readFileSync(path.join(dist, f)))),
    }));
  const entities = await detectEntities(
    tables,
    recordedObservations(app).map((o) => o.dbfDiff),
  );
  return { manifest, tables, observations: recordedRun(app), entities };
}

export async function scoreSample(app: string, llm: LlmClient | null): Promise<SampleScore> {
  const { manifest, tables, observations, entities } = await sampleInputs(app);
  const crew = llm
    ? new CrewLlm({
        client: llm,
        log: new MemoryLlmCallLog(),
        projectId: `score-${app}`,
        budgetTokens: 400_000,
      })
    : null;
  // As the pipeline runs it: the app's own records for lookups (a bill line's medicine).
  const records = Object.fromEntries(tables.map((t) => [t.file, t.table.records]));
  const { rules } = await inferRules(crew, entities, observations, {
    today: manifest.dosTime,
    tables: records,
  });
  const score = scoreSoul(
    graveyardHidden(app),
    { rules, entities },
    graveyardEvidence(app, entities, manifest.dosTime),
  );
  return { app, name: manifest.name, observations: observations.length, score };
}

export async function scoreAll(llm: LlmClient | null): Promise<SampleScore[]> {
  const out: SampleScore[] = [];
  for (const app of SAMPLES) out.push(await scoreSample(app, llm));
  return out;
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n * 100)}%`);

/** The README block, from the score file: one line per sample and mode. */
export function readmeBlock(file: ScoreFile): string {
  const lines = ['<!-- archaeology-score:start -->'];
  for (const [mode, samples] of Object.entries(file)) {
    lines.push(
      '',
      mode === NO_MODEL
        ? '**Without a language model** (keys and counters from the data, and rules found by listing short expressions over the recorded observations, probes included, and keeping those that explain every one):'
        : `**With ${mode}:**`,
      '',
    );
    for (const s of samples)
      lines.push(
        `- ${scoreSentence(s.name, s.score)} Precision ${pct(s.score.precision)}, recall ${pct(s.score.recall)}.`,
      );
  }
  lines.push('', '<!-- archaeology-score:end -->');
  return lines.join('\n');
}

/** The Graveyard page's copy: per mode and app, recovered, exact and known. No rule ids. */
export function webScores(file: ScoreFile) {
  return Object.fromEntries(
    Object.entries(file).map(([mode, samples]) => [
      mode,
      Object.fromEntries(
        samples.map((x) => [
          x.app,
          { recovered: x.score.recovered, exact: x.score.exact, known: x.score.known },
        ]),
      ),
    ]),
  );
}

export function readScoreFile(): ScoreFile {
  return JSON.parse(readFileSync(SCORE_FILE, 'utf8')) as ScoreFile;
}

async function main() {
  const llm = llmClientFrom(process.env);
  const mode = llm ? `${llm.provider}/${llm.model}` : NO_MODEL;
  const samples = await scoreAll(llm);
  for (const s of samples) {
    console.log(`${s.app}: ${scoreSentence(s.name, s.score)}`);
    for (const r of s.score.rules)
      console.log(`  ${r.status.padEnd(10)} ${r.id}${r.by ? ` (${r.by})` : ''}`);
    for (const x of s.score.extra)
      console.log(`  extra      ${x.label}${x.verified ? ' (right)' : ''}`);
  }
  if (process.argv.includes('--write')) {
    let file: ScoreFile = {};
    try {
      file = readScoreFile();
    } catch {
      // The first run writes it.
    }
    file[mode] = samples;
    writeFileSync(SCORE_FILE, `${JSON.stringify(file, null, 2)}\n`);
    writeFileSync(WEB_SCORE_FILE, `${JSON.stringify(webScores(file), null, 2)}\n`);
    const readme = readFileSync(README, 'utf8');
    const block = /<!-- archaeology-score:start -->[\s\S]*<!-- archaeology-score:end -->/;
    if (!block.test(readme)) throw new Error('README.md has no archaeology-score block');
    writeFileSync(README, readme.replace(block, readmeBlock(file)));
    console.log(`Wrote ${path.relative(ROOT, SCORE_FILE)} and README.md (${mode})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
