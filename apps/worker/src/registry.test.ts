import { JOB_OPTIONS, JOB_TYPES } from '@afterlife/db';
import { describe, expect, it } from 'vitest';
import { defaultRegistry, notBuiltYet } from './registry';

describe('the handler registry', () => {
  it('has a handler for every job type, and nothing else', () => {
    expect(Object.keys(defaultRegistry()).sort()).toEqual([...JOB_TYPES].sort());
  });

  it('every job type has retries, a backoff and a timeout', () => {
    for (const type of JOB_TYPES) {
      const o = JOB_OPTIONS[type];
      expect(o.retryLimit, type).toBeGreaterThanOrEqual(1);
      expect(o.retryDelay, type).toBeGreaterThan(0);
      expect(o.timeoutSeconds, type).toBeGreaterThanOrEqual(60);
    }
  });

  it('a step that is not built yet says so and is skipped, not reported done', async () => {
    const r = await notBuiltYet(
      'prove',
      'Prompt 61',
    )({
      projectId: '0192f5a0-0000-7000-8000-000000000001',
      project: {
        name: 'Shifa Medical Store',
        source: 'graveyard',
        sourceApp: 'shifa',
        dosTime: null,
      },
      step: 'prove',
      attempt: 1,
      force: false,
      signal: new AbortController().signal,
      emit: async () => {},
      log: async () => {},
    });
    expect(r).toEqual({ status: 'skipped', reason: 'The prove step is not built yet (Prompt 61)' });
  });
});
