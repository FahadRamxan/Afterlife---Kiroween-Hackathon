// @spec rebirth-certificate#1 The certificate package.
// @spec rebirth-certificate#1.1 RFC 8785 canonical JSON (Prompt 71).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CanonicalError, canonicalize } from './canonical';

describe('canonicalize (RFC 8785)', () => {
  it('sorts members by UTF-16 code units and writes no whitespace', () => {
    expect(canonicalize({ b: 1, a: [true, null, 'x'], A: { z: 0, y: -0 } })).toBe(
      '{"A":{"y":0,"z":0},"a":[true,null,"x"],"b":1}',
    );
    // RFC 8785 section 3.2.3: by code units, so "\u20ac" (U+20AC) sorts before "\ud83d\ude00".
    expect(canonicalize({ '\u{1F600}': 1, '\u20AC': 2, '\r': 3, '1': 4 })).toBe(
      '{"\\r":3,"1":4,"€":2,"😀":1}',
    );
  });

  it('writes numbers in their shortest ECMAScript form (RFC 8785 appendix B)', () => {
    const cases: [number, string][] = [
      [0, '0'],
      [-0, '0'],
      [1e21, '1e+21'],
      [1e-7, '1e-7'],
      // The RFC's input as written: more digits than a double holds.
      [Number('333333333.33333329'), '333333333.3333333'],
      [4.5, '4.5'],
      [9007199254740992, '9007199254740992'],
      [-1.7976931348623157e308, '-1.7976931348623157e+308'],
    ];
    for (const [n, s] of cases) expect(canonicalize(n), String(n)).toBe(s);
  });

  it('escapes strings as JSON.stringify does', () => {
    expect(canonicalize('a"b\\c\n\u0001\u007f€')).toBe('"a\\"b\\\\c\\n\\u0001\u007f€"');
  });

  it('refuses what JSON cannot hold exactly', () => {
    for (const bad of [
      NaN,
      Infinity,
      undefined,
      () => 1,
      { a: undefined },
      new Date(0),
      '\uD800',
      1n,
    ])
      expect(() => canonicalize(bad), String(bad)).toThrow(CanonicalError);
  });

  const json = fc.jsonValue();

  it('round-trip: parsing the canonical text gives the value back', () => {
    fc.assert(
      fc.property(json, (v) => {
        // fast-check's JSON values may hold -0, which JSON writes as 0.
        expect(JSON.parse(canonicalize(v))).toEqual(JSON.parse(JSON.stringify(v)));
      }),
    );
  });

  it('the order members were written in does not matter (invariant)', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), json), fc.infiniteStream(fc.nat()), (o, rnd) => {
        const keys = Object.keys(o);
        const it = rnd[Symbol.iterator]();
        for (let i = keys.length - 1; i > 0; i--) {
          const j = it.next().value! % (i + 1);
          [keys[i], keys[j]] = [keys[j]!, keys[i]!];
        }
        const shuffled = Object.fromEntries(keys.map((k) => [k, o[k]]));
        expect(canonicalize(shuffled)).toBe(canonicalize(o));
      }),
    );
  });

  it('canonical text is its own canonical form (idempotent)', () => {
    fc.assert(
      fc.property(json, (v) => {
        const c = canonicalize(v);
        expect(canonicalize(JSON.parse(c))).toBe(c);
      }),
    );
  });
});
