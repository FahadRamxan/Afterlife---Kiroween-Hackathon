import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NUMBER_COUNTER, nextCounter, nextId } from './counter';

describe('nextId', () => {
  it('a YYMM counter counts within the month, C#### and n+1 from the highest', () => {
    const july = { year: 1998, month: 7 };
    expect(nextId('YYMM-####', ['9806-0003', '9807-0001'], july)).toBe('9807-0002');
    expect(nextId('YYMM-####', ['9806-0003'], july)).toBe('9807-0001');
    expect(nextId('YYMM-####', ['9806-0003'])).toBeNull();
    expect(nextId('C####', ['C0001', 'C0008'])).toBe('C0009');
    expect(nextId(NUMBER_COUNTER, ['1', '7', ' 3'])).toBe('8');
    expect(nextId(NUMBER_COUNTER, [])).toBe('1');
  });

  it('the next id is new and fits its pattern (invariant)', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 9998 }), { maxLength: 30 }), (ns) => {
        const ids = ns.map((n) => `C${String(n).padStart(4, '0')}`);
        const next = nextCounter('C####', ids)!;
        expect(next).toMatch(/^C\d{4}$/);
        expect(ids).not.toContain(next);
        const plain = nextId(NUMBER_COUNTER, ns.map(String))!;
        expect(ns.map(String)).not.toContain(plain);
      }),
    );
  });
});
