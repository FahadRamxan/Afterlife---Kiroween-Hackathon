// @spec living-soul#1.2 The transcript normaliser (Prompt 80): number words to digits, the ways of
// saying percent to "%", in Roman Urdu, Urdu script, English and Devanagari (Transcribe's Hindi).
import { describe, expect, it } from 'vitest';
import { asciiDigits, normaliseTranscript as n } from './normalise';
describe('normaliseTranscript', () => {
  it('"paanch feesad" is 5%, in every way it is written', () => {
    expect(n('paanch feesad')).toBe('5%');
    expect(n('panch fisad')).toBe('5%');
    expect(n('پانچ فیصد')).toBe('5%');
    expect(n('पाँच प्रतिशत')).toBe('5%');
    expect(n('पांच फ़ीसदी')).toBe('5%');
    expect(n('five percent')).toBe('5%');
    expect(n('five per cent')).toBe('5%');
    expect(n('5 percent')).toBe('5%');
    expect(n('5 %')).toBe('5%');
    expect(n('paanch fi sad')).toBe('5%');
  });
  it('a whole request: the numbers in it, the rest as it was said', () => {
    expect(n('senior citizen ko das feesad discount do')).toBe('senior citizen ko 10% discount do');
    expect(n('GST satrah percent se atharah percent kar do')).toBe('GST 17% se 18% kar do');
    expect(n('paanch hazaar se upar ke bill par')).toBe('5000 se upar ke bill par');
    expect(n('پانچ ہزار سے اوپر کے بل پر دس فیصد رعایت')).toBe('5000 سے اوپر کے بل پر 10% رعایت');
    expect(n('बिल पाँच हज़ार से ऊपर हो तो दस प्रतिशत छूट')).toBe('बिल 5000 से ऊपर हो तो 10% छूट');
  });
  it('tens, hundreds, thousands and lakhs', () => {
    expect(n('do sau rupay')).toBe('200 rupay');
    expect(n('teen sau pachaas')).toBe('350');
    expect(n('dedh sau')).toBe('150');
    expect(n('ek lakh')).toBe('100000');
    expect(n('twenty five thousand')).toBe('25000');
    expect(n('one hundred and five')).toBe('100 and 5');
    expect(n('saat sau')).toBe('700');
  });
  it('halves and quarters: dhai, dedh, sawa, saadhe', () => {
    expect(n('dhai feesad')).toBe('2.5%');
    expect(n('ڈھائی فیصد')).toBe('2.5%');
    expect(n('sawa paanch')).toBe('5.25');
    expect(n('saadhe teen sau')).toBe('350');
    expect(n('saadhe saat feesad')).toBe('7.5%');
  });
  it('Urdu and Devanagari digits are digits', () => {
    expect(asciiDigits('۱۷ فیصد')).toBe('17 فیصد');
    expect(n('۱۷ فیصد')).toBe('17%');
    expect(n('१७ प्रतिशत')).toBe('17%');
  });
  it('leaves everyday words that are also numbers alone, unless a percent follows', () => {
    // "do" is "give", "no" is "no", "so" is "so", "sat" is a Saturday in English.
    expect(n('discount do')).toBe('discount do');
    expect(n('no discount')).toBe('no discount');
    expect(n('so the bill')).toBe('so the bill');
    expect(n('do feesad')).toBe('2%');
    expect(n('do sau')).toBe('200');
    // "Give" in Urdu script and in Transcribe's Devanagari too.
    expect(n('رعایت دو')).toBe('رعایت دو');
    expect(n('छूट दो')).toBe('छूट दो');
    expect(n('दो प्रतिशत')).toBe('2%');
  });
  it('keeps punctuation and spacing, and never joins numbers across a comma', () => {
    expect(n('paanch, das')).toBe('5, 10');
    expect(n('  das feesad.  ')).toBe('  10%.  ');
    expect(n('(paanch feesad)')).toBe('(5%)');
    expect(n('پانچ فیصد۔')).toBe('5%۔');
  });
  it('text with no numbers is unchanged', () => {
    expect(n('expiry wali dawai na bechein')).toBe('expiry wali dawai na bechein');
    expect(n('')).toBe('');
  });
});
