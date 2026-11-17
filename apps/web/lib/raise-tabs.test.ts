import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TAB, RAISE_TABS, parseTab } from './raise-tabs';

describe('raise tabs', () => {
  it('has the six tabs in story order', () => {
    expect(RAISE_TABS).toEqual([
      'possession',
      'soul',
      'proof',
      'exorcism',
      'ghost-twin',
      'living-soul',
    ]);
    expect(DEFAULT_TAB).toBe('possession');
  });

  it('parses a known tab and falls back for anything else', () => {
    expect(parseTab('proof')).toBe('proof');
    expect(parseTab('PROOF')).toBe('possession');
    expect(parseTab(undefined)).toBe('possession');
    expect(parseTab(['soul', 'proof'])).toBe('soul');
  });

  it('property: parseTab always returns a valid tab, and is identity on valid tabs', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constantFrom(...RAISE_TABS)), (s) => {
        const t = parseTab(s);
        expect(RAISE_TABS).toContain(t);
        if ((RAISE_TABS as readonly string[]).includes(s)) expect(t).toBe(s);
      }),
    );
  });
});
