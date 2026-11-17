import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { numRunsFromEnv } from '../vitest.setup';

describe('fast-check global setup (Prompt 6)', () => {
  it('defaults to 100 runs', () => {
    expect(numRunsFromEnv(undefined)).toBe(100);
    expect(numRunsFromEnv('')).toBe(100);
  });

  it('reads FC_NUM_RUNS', () => {
    expect(numRunsFromEnv('2000')).toBe(2000);
  });

  it('rejects junk instead of silently running 0 cases', () => {
    expect(() => numRunsFromEnv('lots')).toThrow(/FC_NUM_RUNS/);
    expect(() => numRunsFromEnv('0')).toThrow(/FC_NUM_RUNS/);
  });

  it('is applied globally to fast-check in this run', () => {
    expect(fc.readConfigureGlobal().numRuns).toBe(numRunsFromEnv(process.env.FC_NUM_RUNS));
  });
});
