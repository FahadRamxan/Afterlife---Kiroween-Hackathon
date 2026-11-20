import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scoreFor } from './archaeology-score';

describe('scoreFor', () => {
  it('reads the recorded score of each sample', () => {
    for (const app of ['shifa', 'iqra', 'barkat']) {
      const s = scoreFor(app);
      expect(s, app).not.toBeNull();
      expect(s!.recovered).toBeLessThanOrEqual(s!.known);
    }
    expect(scoreFor('nope')).toBeNull();
  });

  it('takes the best mode, and refuses a bad file', () => {
    const data = {
      'no-model': { shifa: { recovered: 2, exact: 2, known: 7 } },
      'bedrock/x': { shifa: { recovered: 6, exact: 4, known: 7 } },
    };
    expect(scoreFor('shifa', data)).toEqual({
      recovered: 6,
      exact: 4,
      known: 7,
      mode: 'bedrock/x',
    });
    expect(() => scoreFor('shifa', { 'no-model': { shifa: { recovered: -1 } } })).toThrow();
  });

  it('the best is never below any mode’s score (invariant)', () => {
    const counts = fc.record({
      recovered: fc.nat({ max: 10 }),
      exact: fc.nat({ max: 10 }),
      known: fc.integer({ min: 1, max: 10 }),
    });
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), counts, { minKeys: 1 }),
        (modes) => {
          const data = Object.fromEntries(Object.entries(modes).map(([m, c]) => [m, { shifa: c }]));
          const best = scoreFor('shifa', data)!;
          for (const c of Object.values(modes))
            expect(best.recovered).toBeGreaterThanOrEqual(c.recovered);
        },
      ),
    );
  });
});
