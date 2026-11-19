// The glossary check counts a shop word only where it starts a word: a plural passes, but another
// word that merely holds its letters does not. Urdu is built from code points here, so this file
// stays plain ASCII.
import { describe, expect, it } from 'vitest';
import { SHOP_GLOSSARY, glossaryIssues } from './glossary';

const u = (...codes: number[]) => String.fromCodePoint(...codes);
const BILL = SHOP_GLOSSARY.find((g) => g.en.includes('bill'))!.ur;
const missingBill = `say "bill" as "${BILL}"`;

// ba + lam: "bill"; with waw + noon ghunna: "bills".
const bills = u(0x0628, 0x0644, 0x0648, 0x06ba);
// qaf + ba + lam: "before". Its last two letters are "bill", but it is not the word.
const before = u(0x0642, 0x0628, 0x0644);
// meem + qaf + alif + ba + lam + heh goal: "comparison", "bill" inside it again.
const comparison = u(0x0645, 0x0642, 0x0627, 0x0628, 0x0644, 0x06c1);
// alif + seen: "this"; seen + yeh barree: "from".
const thisWord = u(0x0627, 0x0633);
const from = u(0x0633, 0x06d2);

describe('glossary words must start a word', () => {
  it('the glossary word for bill is ba + lam (the strings below are built on it)', () => {
    expect([...BILL].map((c) => c.codePointAt(0))).toEqual([0x0628, 0x0644]);
  });

  it('a plural passes: the word starts it', () => {
    expect(glossaryIssues('Bills are printed', bills)).toEqual([]);
    expect(glossaryIssues('The bill is printed', `(${BILL})`)).toEqual([]);
  });

  it('a different word that only holds its letters does not count', () => {
    expect(glossaryIssues('The bill is printed', `${thisWord} ${from} ${before}`)).toContain(
      missingBill,
    );
    expect(glossaryIssues('The bill is printed', comparison)).toContain(missingBill);
  });
});
