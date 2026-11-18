// What each job type does. The Crew's agents fill this in, prompt by prompt; until then a step
// says it is not built yet and is marked "skipped" (never "done").
import type { EventType, JobType } from '@afterlife/db';
import { graveyardBundle, possessFirstLook, type EmulatorPool } from './possess';

export type StepContext = {
  projectId: string;
  /** The project's app: where it came from and its id (`shifa`, or an upload's file name). */
  project: { name: string; source: 'graveyard' | 'upload'; sourceApp: string };
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
  { status: 'done'; output: unknown } | { status: 'skipped'; reason: string };
export type StepHandler = (ctx: StepContext) => Promise<StepResult>;
export type Registry = Record<JobType, StepHandler>;

/** A placeholder for a step whose agent comes in a later prompt. */
export const notBuiltYet =
  (step: JobType, prompt: string): StepHandler =>
  async () => ({ status: 'skipped', reason: `The ${step} step is not built yet (${prompt})` });

/**
 * The handlers the worker runs today. With an emulator pool, possess boots the app and sends its
 * first screen (the Possessor's exploration is Prompt 48).
 */
export function defaultRegistry(deps: { pool?: EmulatorPool } = {}): Registry {
  return {
    possess: deps.pool
      ? possessFirstLook({ pool: deps.pool, bundleFor: graveyardBundle })
      : notBuiltYet('possess', 'Prompt 48'),
    archaeology: notBuiltYet('archaeology', 'Prompt 55'),
    rebirth: notBuiltYet('rebirth', 'Prompt 63'),
    undertake: notBuiltYet('undertake', 'Prompt 64'),
    prove: notBuiltYet('prove', 'Prompt 68'),
    exorcise: notBuiltYet('exorcise', 'Prompt 73'),
    'twin-replay': notBuiltYet('twin-replay', 'Prompt 77'),
    'voice-change': notBuiltYet('voice-change', 'Prompt 81'),
  };
}
