import { describe, expect, it, vi } from 'vitest';
import { applyStepEvents, getSteps, rerunStep, type StepState } from './steps';

const id = '0192f5a0-1234-7abc-8def-0123456789ab';
const pending = (step: string): StepState => ({
  step,
  status: 'pending',
  attempts: 0,
  error: null,
  reason: null,
  recorded: false,
  finishedAt: null,
  vessel: null,
  crossing: null,
  proof: null,
});
const SIX = ['possess', 'archaeology', 'rebirth', 'undertake', 'prove', 'exorcise'].map(pending);
const json = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('getSteps and rerunStep', () => {
  it('reads the six steps', async () => {
    const f = json(200, { projectId: id, steps: SIX });
    expect(await getSteps('https://a', id, f)).toEqual({ ok: true, steps: SIX });
    expect(f).toHaveBeenCalledWith(`https://a/api/projects/${id}/steps`, expect.anything());
  });

  it('the rebirth step, done, gives the reborn app; an older API without it gives null', async () => {
    // @spec surgeon#3.1
    const vessel = { url: `/vessel/${id}`, actions: [{ id: 'save-bill', name: 'Save a bill' }] };
    const reborn = SIX.map((x) => (x.step === 'rebirth' ? { ...x, status: 'done', vessel } : x));
    const r = await getSteps('https://a', id, json(200, { projectId: id, steps: reborn }));
    expect(r.ok && r.steps[2]!.vessel).toEqual(vessel);
    const old = SIX.map((x) =>
      Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'vessel' && k !== 'crossing')),
    );
    const o = await getSteps('https://a', id, json(200, { projectId: id, steps: old }));
    expect(o.ok && o.steps.every((x) => x.vessel === null && x.crossing === null)).toBe(true);
  });

  it('a step done in a recorded run is marked recorded by its live event (Prompt 53)', () => {
    const ev = (state: string, extra = {}) => ({
      seq: 1,
      type: 'step',
      at: '',
      payload: { step: 'archaeology', state, attempt: 1, ...extra },
    });
    const done = applyStepEvents(SIX, [ev('started'), ev('done', { recorded: true })]);
    expect(done.find((s) => s.step === 'archaeology')).toMatchObject({
      status: 'done',
      recorded: true,
    });
    const live = applyStepEvents(SIX, [ev('done')]);
    expect(live.find((s) => s.step === 'archaeology')!.recorded).toBe(false);
  });

  it('says why it cannot: no database, or the step is already waiting', async () => {
    expect(
      await getSteps('https://a', id, json(503, { error: 'NO_DATABASE', message: 'no db' })),
    ).toEqual({
      ok: false,
      reason: 'error',
      message: 'no db',
    });
    const f = json(409, { error: 'ALREADY_QUEUED', message: 'rebirth is already waiting to run' });
    expect(await rerunStep('https://a', id, 'rebirth', f)).toEqual({
      ok: false,
      reason: 'error',
      message: 'rebirth is already waiting to run',
    });
    expect(f).toHaveBeenCalledWith(
      `https://a/api/projects/${id}/steps/rebirth/run`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('applyStepEvents', () => {
  it('moves each step along as its live step events arrive, newest last', () => {
    const steps = applyStepEvents(SIX, [
      { seq: 1, type: 'step', payload: { step: 'possess', state: 'started', attempt: 1 }, at: '' },
      { seq: 2, type: 'log', payload: { level: 'info', message: 'x' }, at: '' },
      {
        seq: 3,
        type: 'step',
        payload: {
          step: 'possess',
          state: 'skipped',
          attempt: 1,
          message: 'Exploration is not built yet',
        },
        at: '',
      },
      {
        seq: 4,
        type: 'step',
        payload: { step: 'archaeology', state: 'started', attempt: 1 },
        at: '',
      },
    ]);
    expect(steps[0]).toMatchObject({
      status: 'skipped',
      reason: 'Exploration is not built yet',
      attempts: 1,
    });
    expect(steps[1]).toMatchObject({ status: 'running', attempts: 1 });
    expect(steps.slice(2).every((s) => s.status === 'pending')).toBe(true);
  });

  it('a retry shows as queued with its error; a recorded run is marked recorded', () => {
    const steps = applyStepEvents(SIX, [
      {
        seq: 1,
        type: 'step',
        payload: { step: 'prove', state: 'retrying', attempt: 1, message: 'boom' },
        at: '',
      },
      {
        seq: 2,
        type: 'step',
        payload: {
          step: 'rebirth',
          state: 'skipped',
          attempt: 1,
          message: 'Recorded run: not built yet',
        },
        at: '',
      },
    ]);
    expect(steps[4]).toMatchObject({ status: 'queued', error: 'boom' });
    expect(steps[2]).toMatchObject({ status: 'skipped', recorded: true });
  });
});
