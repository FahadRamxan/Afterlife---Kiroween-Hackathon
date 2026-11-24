// @spec living-soul#1.2 The normaliser's properties: a number said as words gives its digits, with
// or without "percent"; normalising twice changes nothing more; words that are not numbers stay.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normaliseTranscript as n } from './normalise';
/** 1 to 99 as a unit word, or a ten and a unit in English; each with its value. */
const ROMAN: [string, number][] = [
  ['ek', 1],
  ['do', 2],
  ['teen', 3],
  ['char', 4],
  ['paanch', 5],
  ['chhe', 6],
  ['saat', 7],
  ['aath', 8],
  ['nau', 9],
  ['das', 10],
  ['pandrah', 15],
  ['bees', 20],
  ['pachees', 25],
  ['pachaas', 50],
  ['pachattar', 75],
];
const URDU: [string, number][] = [
  ['ایک', 1],
  ['دو', 2],
  ['تین', 3],
  ['پانچ', 5],
  ['دس', 10],
  ['بیس', 20],
  ['پچاس', 50],
];
const HINDI: [string, number][] = [
  ['एक', 1],
  ['दो', 2],
  ['पाँच', 5],
  ['दस', 10],
  ['बीस', 20],
  ['पचास', 50],
];
const word = fc.constantFrom(...ROMAN, ...URDU, ...HINDI);
const scale = fc.constantFrom<[string, number][]>(
  [['sau', 100]],
  [['hazaar', 1000]],
  [['lakh', 100_000]],
  [],
);
const percent = fc.constantFrom('feesad', 'percent', 'فیصد', 'प्रतिशत', '%');
describe('normaliseTranscript (properties)', () => {
  it('a number word, times a scale, then percent: its digits and %', () => {
    fc.assert(
      fc.property(word, scale, percent, ([w, v], s, p) => {
        const said = [w, ...s.map(([x]) => x), p].join(' ');
        const value = v * (s[0]?.[1] ?? 1);
        expect(n(said)).toBe(`${value}%`);
      }),
    );
  });
  it('is idempotent', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            word.map(([w]) => w),
            percent,
            fc.string(),
          ),
          { maxLength: 8 },
        ),
        (ws) => {
          const once = n(ws.join(' '));
          expect(n(once)).toBe(once);
        },
      ),
    );
  });
  it('leaves a sentence of ordinary shop words as it was', () => {
    const plain = fc.constantFrom(
      'bill',
      'dawai',
      'discount',
      'customer',
      'expiry',
      'wali',
      'par',
      'se',
      'upar',
      'kar',
      'hai',
      'ko',
      'stock',
      'qeemat',
      'saath',
      'bara',
      'رعایت',
      'بل',
      'دوائی',
      'छूट',
      'बिल',
    );
    fc.assert(
      fc.property(
        fc.array(plain, { maxLength: 10 }),
        fc.constantFrom(' ', '  ', '\n'),
        (ws, sp) => {
          const s = ws.join(sp);
          expect(n(s)).toBe(s);
        },
      ),
    );
  });
});
