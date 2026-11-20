import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LiveEvent } from './live';
import { foundRuleIds, freshRules, lastSeq, typed, typingMs } from './rule-discovery';

describe('typed', () => {
  it('writes the text in, one character per step', () => {
    expect(typed('GST 17%', 0, 10)).toBe('');
    expect(typed('GST 17%', 35, 10)).toBe('GST');
    expect(typed('GST 17%', 1000, 10)).toBe('GST 17%');
    expect(typed('abc', Number.NaN)).toBe('');
  });

  it('never cuts an Urdu letter or an emoji in half', () => {
    expect(typed('بل 👻', 30, 10)).toBe('بل ');
    expect(typed('بل 👻', 40, 10)).toBe('بل 👻');
  });

  it('is always a prefix, grows with time, and is whole by typingMs (invariant)', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', maxLength: 40 }),
        fc.nat({ max: 5000 }),
        fc.nat({ max: 5000 }),
        fc.integer({ min: 1, max: 50 }),
        (text, a, b, ms) => {
          const [early, late] = a <= b ? [a, b] : [b, a];
          const x = typed(text, early, ms);
          const y = typed(text, late, ms);
          expect(text.startsWith(x)).toBe(true);
          expect(y.startsWith(x)).toBe(true);
          expect(typed(text, typingMs(text, ms), ms)).toBe(text);
        },
      ),
    );
  });
});

describe('freshRules', () => {
  it('nothing is new on the first load; then what was not shown before is', () => {
    expect(freshRules(null, ['a', 'b'])).toEqual([]);
    expect(freshRules(new Set(['a']), ['a', 'b', 'c'])).toEqual(['b', 'c']);
    expect(freshRules(new Set(), ['a'])).toEqual(['a']);
  });

  it('a rule shown before is never fresh (invariant)', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string()), fc.uniqueArray(fc.string()), (before, now) => {
        const fresh = freshRules(new Set(before), now);
        for (const id of fresh) {
          expect(before).not.toContain(id);
          expect(now).toContain(id);
        }
        expect(fresh.length + now.filter((id) => before.includes(id)).length).toBe(now.length);
      }),
    );
  });
});

describe('foundRuleIds and lastSeq', () => {
  const ev = (seq: number, type: string, payload: unknown): LiveEvent => ({
    seq,
    type,
    payload,
    at: '2026-11-20T10:00:00Z',
  });
  const events = [
    ev(1, 'rule_found', { ruleId: 'bill-gst' }),
    ev(2, 'log', { message: 'x' }),
    ev(3, 'rule_found', { ruleId: 'bill-discount' }),
    ev(4, 'rule_found', { ruleId: 'bill-discount' }),
    ev(5, 'rule_found', null),
  ];

  it('only rule_found events after the page opened, each rule once', () => {
    expect(foundRuleIds(events, 1)).toEqual(['bill-discount']);
    expect(foundRuleIds(events, -1)).toEqual(['bill-gst', 'bill-discount']);
    expect(lastSeq(events)).toBe(5);
    expect(lastSeq([])).toBe(-1);
  });
});
