import { PIPELINE, SEED_PROJECTS } from '@afterlife/db';
import { ScreenWireSchema, fromWire, gridText } from '@afterlife/screen';
import { describe, expect, it } from 'vitest';
import {
  MAX_PAUSE_MS,
  PROOF_CASE_PAUSE_MS,
  loadRecording,
  replayStep,
  type Recording,
} from './recording';
import type { StepContext } from './registry';

const TITLES: Record<string, RegExp> = {
  shifa: /SHIFA MEDICAL STORE/,
  iqra: /IQRA/,
  barkat: /BARKAT/,
};

function ctx(events: [string, unknown][]): StepContext {
  return {
    projectId: '0192f5a0-0000-7000-8000-000000000001',
    project: {
      name: 'Shifa Medical Store',
      source: 'graveyard',
      sourceApp: 'shifa',
      dosTime: null,
    },
    step: 'possess',
    attempt: 1,
    force: false,
    signal: new AbortController().signal,
    emit: async (type, payload) => {
      events.push([type, payload]);
    },
    log: async (message) => {
      events.push(['log', { message }]);
    },
  };
}

describe('the recorded runs in apps/worker/recorded', () => {
  for (const { sourceApp } of SEED_PROJECTS)
    it(`${sourceApp}: a real run of all six steps, with the app's first screen`, () => {
      const rec = loadRecording(sourceApp)!;
      expect(rec).not.toBeNull();
      expect(rec.app).toBe(sourceApp);
      expect(rec.steps.map((s) => s.step)).toEqual([...PIPELINE]);
      const screen = rec.steps[0]!.events.find((e) => e.type === 'screen')!;
      const grid = fromWire(ScreenWireSchema.parse((screen.payload as { grid: unknown }).grid));
      expect(gridText(grid).join('\n')).toMatch(TITLES[sourceApp]!);
    });

  it('only Graveyard apps have one: no path is read from a project', () => {
    for (const app of ['../../package', 'doom', '']) expect(loadRecording(app)).toBeNull();
  });
});

describe('replayStep', () => {
  const rec: Recording = {
    app: 'shifa',
    recordedAt: '2026-11-19T10:00:00.000Z',
    source: 'pnpm pipeline:record',
    steps: PIPELINE.map((step) => ({
      step,
      status: 'skipped' as const,
      output: { reason: `The ${step} step is not built yet` },
      events: [
        { type: 'log' as const, payload: { level: 'info', message: 'a' }, afterMs: 0 },
        // A long pause in the real run is cut to MAX_PAUSE_MS.
        { type: 'log' as const, payload: { level: 'info', message: 'b' }, afterMs: 60_000 },
      ],
    })),
  };

  it('says it is a recorded run, replays the events, and caps long pauses', async () => {
    const events: [string, unknown][] = [];
    const started = Date.now();
    const r = await replayStep(rec, 'prove')(ctx(events));
    expect(Date.now() - started).toBeLessThan(MAX_PAUSE_MS + 1000);
    expect(events.map(([, p]) => (p as { message: string }).message)).toEqual([
      'Recorded run from 2026-11-19: replaying prove',
      'a',
      'b',
    ]);
    expect(r).toEqual({
      status: 'skipped',
      reason: 'Recorded run: The prove step is not built yet',
    });
  });

  it('replays a proof’s cases quickly: at most PROOF_CASE_PAUSE_MS between them (Prompt 70)', async () => {
    const cases: Recording = {
      ...rec,
      steps: rec.steps.map((s) => ({
        ...s,
        events: Array.from({ length: 10 }, (_, i) => ({
          type: 'proof_case' as const,
          payload: { index: i },
          afterMs: i * 5_000,
        })),
      })),
    };
    const events: [string, unknown][] = [];
    const started = Date.now();
    await replayStep(cases, 'prove')(ctx(events));
    expect(events.filter(([type]) => type === 'proof_case')).toHaveLength(10);
    expect(Date.now() - started).toBeLessThan(10 * PROOF_CASE_PAUSE_MS + 1000);
    expect(PROOF_CASE_PAUSE_MS).toBeLessThan(MAX_PAUSE_MS);
  });
});
