import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { KEY_NAMES, MODIFIERS, jsdosKeys, parseKeys, printKeys, type KeyStroke } from './keys';

// Every printable ASCII character, braces included.
const printable = fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c));
const text = fc.array(printable, { minLength: 1, maxLength: 12 }).map((a) => a.join(''));
const mods = fc.subarray([...MODIFIERS]);
const stroke: fc.Arbitrary<KeyStroke> = fc.oneof(
  text.map((t) => ({ kind: 'text', text: t }) as const),
  fc
    .tuple(fc.constantFrom(...KEY_NAMES), mods)
    .map(([key, m]) => ({ kind: 'key', key, mods: m }) as const),
);

/** Adjacent text strokes are one stroke: the canonical form parseKeys returns. */
function merge(strokes: KeyStroke[]): KeyStroke[] {
  const out: KeyStroke[] = [];
  for (const s of strokes) {
    const last = out.at(-1);
    if (s.kind === 'text' && last?.kind === 'text')
      out[out.length - 1] = { kind: 'text', text: last.text + s.text };
    else out.push(s);
  }
  return out;
}

describe('key sequences round-trip', () => {
  it('parseKeys(printKeys(x)) gives back x', () => {
    fc.assert(
      fc.property(fc.array(stroke, { maxLength: 10 }), (strokes) => {
        expect(parseKeys(printKeys(strokes))).toEqual(merge(strokes));
      }),
    );
  });

  it('printing is canonical: print(parse(print(x))) is print(x)', () => {
    fc.assert(
      fc.property(fc.array(stroke, { maxLength: 10 }), (strokes) => {
        const once = printKeys(strokes);
        expect(printKeys(parseKeys(once))).toBe(once);
      }),
    );
  });

  it('every stroke becomes js-dos key codes: one press per character, one per named key', () => {
    fc.assert(
      fc.property(fc.array(stroke, { maxLength: 10 }), (strokes) => {
        const presses = jsdosKeys(strokes);
        const expected = strokes.reduce((n, s) => n + (s.kind === 'text' ? s.text.length : 1), 0);
        expect(presses).toHaveLength(expected);
        for (const p of presses) {
          expect(p.length).toBeGreaterThan(0);
          for (const code of p) expect(Number.isInteger(code)).toBe(true);
        }
      }),
    );
  });
});
