import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidv7 } from './uuid';

describe('uuidv7', () => {
  it('is a version 7, RFC 9562 variant UUID', () => {
    expect(uuidv7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('starts with the time in milliseconds, so ids sort by creation time', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 48 - 1 }), (ms) => {
        expect(parseInt(uuidv7(ms).replace(/-/g, '').slice(0, 12), 16)).toBe(ms);
      }),
    );
    expect(uuidv7(1000) < uuidv7(2000)).toBe(true);
  });

  it('two ids in the same millisecond still differ', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(5)));
    expect(ids.size).toBe(1000);
  });
});
