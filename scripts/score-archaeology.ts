// Archaeology scoring (Prompt 56): what the Archaeologist recovers of each sample app's hidden
// rules (manifest.json `knownRules`, with the truth our team wrote from the C source).
//
// For each sample: the entities from the app's data files and its recorded possession
// (apps/worker/recorded), then, with a model set up (LLM_PROVIDER=bedrock), the rules the model
// proposes and the deterministic check keeps. The Soul is scored against the hidden truth, with the
// app's scripted scenario runs (samples/graveyard/fixtures) as the evidence for equivalence.
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
/** The score when no model is set up: entities and counters only. */
export const NO_MODEL = 'no-model';

export type SampleScore = { app: string; name: string; observations: number; score: Score };
export type ScoreFile = Record<string, SampleScore[]>;

/** The observations of an app's recorded possession: each action that changed its data. */
export function recordedObservations(app: string): EffectObservation[] {
  const rec = JSON.parse(
    readFileSync(path.join(ROOT, 'apps', 'worker', 'recorded', `${app}.json`), 'utf8'),
  ) as { steps: { step: string; events: { type: string; payload: Record<string, unknown> }[] }[] };
  const possess = rec.steps.find((s) => s.step === 'possess');
  return (possess?.events ?? [])
    .filter((e) => e.type === 'observation' && e.payload.diff)
    .map((e, i) => ({
      id: String(e.payload.id ?? `recorded-${i}`),
      keys: String(e.payload.keys ?? ''),
      screenBefore: {},
      dbfDiff: e.payload.diff as SnapshotDiff,
    }));
}

export async function scoreSample(app: string, llm: LlmClient | null): Promise<SampleScore> {
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
  const observations = recordedObservations(app);
  const entities = await detectEntities(
    tables,
    observations.map((o) => o.dbfDiff),
  );
  const rules = llm
    ? (
        await inferRules(
          new CrewLlm({
            client: llm,
            log: new MemoryLlmCallLog(),
            projectId: `score-${app}`,
            budgetTokens: 400_000,
          }),
          entities,
          observations,
          { today: manifest.dosTime },
        )
      ).rules
    : [];
  const score = scoreSoul(
    graveyardHidden(app),
    { rules, entities },
    graveyardEvidence(app, entities),
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
        ? '**Without a language model** (entities and counters only: the rules need a model):'
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
