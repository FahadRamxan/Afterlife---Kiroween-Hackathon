import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeText } from './fake';
import { MemoryLlmCallLog } from './log';
import { CrewLlm, LlmBudgetError, backoffMs } from './runtime';

describe('backoff (invariant)', () => {
  it('never shrinks between retries and never passes the maximum', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 60_000 }),
        fc.integer({ min: 1, max: 30 }),
        (base, max, n) => {
          const p = { attempts: 99, baseDelayMs: base, maxDelayMs: max };
          expect(backoffMs(p, n + 1)).toBeGreaterThanOrEqual(backoffMs(p, n));
          expect(backoffMs(p, n)).toBeLessThanOrEqual(max);
        },
      ),
    );
  });
});

describe('token budget (invariant)', () => {
  it('no call is sent once the logged tokens reach the budget', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 400 }),
        fc.array(fc.string({ maxLength: 80 }), { minLength: 1, maxLength: 12 }),
        async (budget, prompts) => {
          const client = new FakeLlmClient(() => fakeText('ok'));
          const log = new MemoryLlmCallLog();
          const llm = new CrewLlm({ client, log, projectId: 'p', budgetTokens: budget });
          for (const text of prompts) {
            const before = await log.tokensUsed('p');
            const sent = client.requests.length;
            try {
              await llm.converse(
                { messages: [{ role: 'user', content: [{ type: 'text', text }] }], maxTokens: 50 },
                { agent: 'possessor', purpose: 'p' },
              );
              expect(before).toBeLessThan(budget);
            } catch (e) {
              expect(e).toBeInstanceOf(LlmBudgetError);
              expect(before).toBeGreaterThanOrEqual(budget);
              expect(client.requests.length).toBe(sent);
            }
          }
          // Every request asked for no more output than was left at the time.
          for (const r of client.requests) expect(r.maxTokens).toBeLessThanOrEqual(budget);
        },
      ),
    );
  });
});
