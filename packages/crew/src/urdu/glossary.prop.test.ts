import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SHOP_GLOSSARY, glossaryIssues, termsIn } from './glossary';

const filler = fc.constantFrom('the', 'is', 'of', 'after', 'each', 'total', '17%', 'Rs.', '500');
const term = fc.constantFrom(...SHOP_GLOSSARY.flatMap((g) => g.en));
const sentence = fc
  .array(fc.oneof(filler, term), { minLength: 1, maxLength: 12 })
  .map((w) => w.join(' '));
const urduFiller = fc.constantFrom('یہ', 'کے بعد', 'کل', 'ہر', 'ہوتا ہے');

describe('glossary check (invariant)', () => {
  it('passes exactly when every required Urdu word is there', () => {
    fc.assert(
      fc.property(sentence, fc.array(urduFiller, { minLength: 1, maxLength: 5 }), (en, extra) => {
        const required = termsIn(en).map((g) => g.ur);
        const full = [...extra, ...required].join(' ');
        expect(glossaryIssues(en, full)).toEqual([]);
        // Leaving any one required word out is caught. (Skipped when another required word
        // contains it, which this glossary does not have.)
        for (const w of required) {
          const without = [...extra, ...required.filter((x) => x !== w)].join(' ');
          if (!without.includes(w))
            expect(glossaryIssues(en, without)).toContain(
              `say "${SHOP_GLOSSARY.find((g) => g.ur === w)!.en[0]}" as "${w}"`,
            );
        }
      }),
    );
  });
});
