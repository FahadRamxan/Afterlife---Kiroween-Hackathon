// What each job type does. The Crew's agents fill this in, prompt by prompt; until then a step
// says it is not built yet and is marked "skipped" (never "done").
import type { EventType, JobType } from '@afterlife/db';
import type { Db } from '@afterlife/db';
import { entitiesStep } from './entities-step';
import { graveyardBundle, possessApp, type EmulatorPool } from './possess';
import { scanUpload, uploadBundle } from './scan-upload';
import type { VirusScanner } from './scanner';
import { translateSoulStep } from './translate-soul';
import { DEFAULT_TOKEN_BUDGET, type LlmClient, type SpeechClient } from '@afterlife/crew';

export type StepContext = {
  projectId: string;
  /** The project's app: where it came from and its id (`shifa`, or an upload's file name). */
  project: {
    name: string;
    source: 'graveyard' | 'upload';
    sourceApp: string;
    /** An uploaded app's DOS clock; null for Graveyard apps (their manifest has it). */
    dosTime: string | null;
  };
  step: JobType;
  /** 1 for the first try. */
  attempt: number;
  /** True when the step was asked to run again although it was done. */
  force: boolean;
  /** Aborted when the attempt times out or the worker stops: stop work and return. */
  signal: AbortSignal;
  /** Writes a progress event (crew.md: screen, observation, rule_found, ...). */
  emit: (type: EventType, payload: unknown) => Promise<void>;
  log: (message: string, level?: 'info' | 'warn' | 'error') => Promise<void>;
};

export type StepResult =
  | { status: 'done'; output: unknown }
  | { status: 'skipped'; reason: string }
  /** Final: not retried, and the pipeline stops (a virus found, a bad upload). */
  | { status: 'failed'; reason: string };
export type StepHandler = (ctx: StepContext) => Promise<StepResult>;
export type Registry = Record<JobType, StepHandler>;

/** A placeholder for a step whose agent comes in a later prompt. */
export const notBuiltYet =
  (step: JobType, prompt: string): StepHandler =>
  async () => ({ status: 'skipped', reason: `The ${step} step is not built yet (${prompt})` });

/**
 * The handlers the worker runs today. With an emulator pool, possess boots the app and sends its
 * first screen, then the Possessor explores it (Prompt 48).
 */
export function defaultRegistry(
  deps: {
    pool?: EmulatorPool;
    db?: Db;
    scanner?: VirusScanner;
    /** The model (LLM_PROVIDER); null when none is set up. */
    llm?: LlmClient | null;
    budgetTokens?: number;
    /** At most this many key sequences per possession (POSSESS_MAX_ACTIONS). */
    maxActions?: number;
    /** Values typed into each field (POSSESS_PROBES). */
    probesPerField?: number;
    /** Transcribes séance voice notes (SPEECH_PROVIDER); null: none. */
    speech?: SpeechClient | null;
  } = {},
): Registry {
  const { db } = deps;
  // A Graveyard app's bundle is a file; an upload's is in the database once it is clean.
  const bundleFor = async (p: StepContext['project'], projectId: string) =>
    p.source === 'upload' ? (db ? uploadBundle(db, projectId) : null) : graveyardBundle(p);
  return {
    possess: deps.pool
      ? possessApp({
          pool: deps.pool,
          ...(db ? { db } : {}),
          llm: deps.llm ?? null,
          budgetTokens: deps.budgetTokens ?? DEFAULT_TOKEN_BUDGET,
          ...(deps.maxActions ? { maxActions: deps.maxActions } : {}),
          ...(deps.probesPerField ? { probesPerField: deps.probesPerField } : {}),
          speech: deps.speech ?? null,
          bundleFor,
        })
      : async () => ({
          status: 'skipped',
          reason: 'This worker has no emulator to run the app in',
        }),
    // The entities, keys and counters (Prompt 53), then the rules, checked (Prompts 54 and 55).
    archaeology: db
      ? entitiesStep({
          db,
          bundleFor,
          llm: deps.llm ?? null,
          budgetTokens: deps.budgetTokens ?? DEFAULT_TOKEN_BUDGET,
        })
      : async () => ({ status: 'skipped', reason: 'This worker has no database' }),
    rebirth: notBuiltYet('rebirth', 'Prompt 63'),
    undertake: notBuiltYet('undertake', 'Prompt 64'),
    prove: notBuiltYet('prove', 'Prompt 68'),
    exorcise: notBuiltYet('exorcise', 'Prompt 73'),
    'twin-replay': notBuiltYet('twin-replay', 'Prompt 77'),
    'voice-change': notBuiltYet('voice-change', 'Prompt 81'),
    'scan-upload':
      db && deps.scanner
        ? scanUpload({ db, scanner: deps.scanner })
        : async () => ({ status: 'failed', reason: 'This worker has no virus scanner' }),
    'translate-soul': db
      ? translateSoulStep({
          db,
          llm: deps.llm ?? null,
          budgetTokens: deps.budgetTokens ?? DEFAULT_TOKEN_BUDGET,
        })
      : async () => ({ status: 'failed', reason: 'This worker has no database' }),
  };
}
