import { describe, expect, it } from 'vitest';
import { startWorker } from './worker';

describe('startWorker', () => {
  it('refuses to start without DATABASE_URL, and says why', async () => {
    await expect(startWorker({ databaseUrl: undefined, log: () => {} })).rejects.toThrow(
      /needs DATABASE_URL/,
    );
  });
});
