import fc from 'fast-check';

/** Number of fast-check runs per property. 100 locally, 2000 in the nightly job. */
export function numRunsFromEnv(value: string | undefined): number {
  if (value === undefined || value === '') return 100;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`FC_NUM_RUNS must be a positive integer, got "${value}"`);
  }
  return n;
}

fc.configureGlobal({ numRuns: numRunsFromEnv(process.env.FC_NUM_RUNS) });
