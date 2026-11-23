// @spec ghost-twin#4.1 A day's candle: red whenever anything mismatched, green only when all did.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { candleOf } from './twin';
const n = fc.integer({ min: 0, max: 60 });
describe('candleOf', () => {
  it('is red with any mismatch, green exactly when every transaction matched', () => {
    fc.assert(
      fc.property(n, n, n, n, (matched, mismatched, unknown, pending) => {
        const total = matched + mismatched + unknown + pending;
        fc.pre(total > 0);
        const c = candleOf({ date: '1998-07-15', total, matched, mismatched, unknown, pending });
        expect(c === 'mismatched').toBe(mismatched > 0);
        expect(c === 'matched').toBe(matched === total);
      }),
    );
  });
});
