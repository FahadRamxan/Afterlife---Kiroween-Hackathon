// What the owner said, made ready for the rule language (Prompt 80): number words become digits
// and the ways of saying "percent" become "%". Shop owners in Pakistan mix Roman Urdu ("paanch
// feesad"), Urdu script ("پانچ فیصد"), English ("five percent"), and Amazon Transcribe writes
// spoken Urdu in Devanagari (it has Hindi, hi-IN, and no Urdu): "पाँच प्रतिशत". All give "5%".
// Pure: no model, no network. Words it does not know are left as they were.

/** The value of each number word, by language. Keys are lower case, spelling variants included. */
const UNITS: Record<string, number> = {};
const add = (n: number, ...words: string[]) => {
  for (const w of words) UNITS[w.normalize('NFC')] = n;
};
// Roman Urdu (as people type and say it), English, Urdu script, Devanagari.
add(0, 'zero', 'sifar', 'sifr', 'صفر', 'शून्य');
add(1, 'one', 'ek', 'aik', 'ایک', 'एक');
add(2, 'two', 'do', 'دو', 'दो');
add(3, 'three', 'teen', 'tin', 'تین', 'तीन');
add(4, 'four', 'char', 'chaar', 'چار', 'चार');
add(5, 'five', 'paanch', 'panch', 'paanc', 'پانچ', 'पाँच', 'पांच');
add(6, 'six', 'chhe', 'chay', 'chhay', 'che', 'چھ', 'छह', 'छः', 'छे');
add(7, 'seven', 'saat', 'sat', 'سات', 'सात');
add(8, 'eight', 'aath', 'aat', 'آٹھ', 'आठ');
add(9, 'nine', 'nau', 'no', 'نو', 'नौ');
add(10, 'ten', 'das', 'dus', 'دس', 'दस');
add(11, 'eleven', 'gyarah', 'gyara', 'گیارہ', 'ग्यारह');
add(12, 'twelve', 'barah', 'bara', 'بارہ', 'बारह');
add(13, 'thirteen', 'terah', 'tera', 'تیرہ', 'तेरह');
add(14, 'fourteen', 'chaudah', 'chauda', 'چودہ', 'चौदह');
add(15, 'fifteen', 'pandrah', 'pandra', 'پندرہ', 'पंद्रह', 'पन्द्रह');
add(16, 'sixteen', 'solah', 'sola', 'سولہ', 'सोलह');
add(17, 'seventeen', 'satrah', 'satra', 'سترہ', 'सत्रह');
add(18, 'eighteen', 'atharah', 'athara', 'اٹھارہ', 'अठारह');
add(19, 'nineteen', 'unnees', 'unees', 'انیس', 'उन्नीस');
add(20, 'twenty', 'bees', 'bis', 'بیس', 'बीस');
add(25, 'pachees', 'pachchees', 'پچیس', 'पच्चीस');
add(30, 'thirty', 'tees', 'تیس', 'तीस');
add(40, 'forty', 'chalees', 'chaalees', 'چالیس', 'चालीस');
add(50, 'fifty', 'pachaas', 'pachas', 'پچاس', 'पचास');
add(60, 'sixty', 'saath', 'sath', 'ساٹھ', 'साठ');
add(70, 'seventy', 'sattar', 'ستر', 'सत्तर');
add(75, 'pachattar', 'pachhattar', 'پچھتر', 'पचहत्तर');
add(80, 'eighty', 'assi', 'assee', 'اسی', 'अस्सी');
add(90, 'ninety', 'nabbe', 'nawway', 'نوے', 'नब्बे');
/** Words that multiply what came before (do sau = 200, paanch hazaar = 5000). */
const SCALES: Record<string, number> = {};
const scale = (n: number, ...words: string[]) => {
  for (const w of words) SCALES[w.normalize('NFC')] = n;
};
scale(100, 'hundred', 'sau', 'so', 'سو', 'सौ');
scale(1000, 'thousand', 'hazaar', 'hazar', 'ہزار', 'हज़ार', 'हजार');
scale(100_000, 'lakh', 'lac', 'لاکھ', 'लाख');
scale(10_000_000, 'crore', 'karor', 'کروڑ', 'करोड़');
/** Fractions said before a number: dedh (1½), dhai (2½), sawa X (X + ¼), saadhe X (X + ½). */
const nfcKeys = (o: Record<string, number>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.normalize('NFC'), v]));
const FRACTIONS: Record<string, number> = nfcKeys({
  dedh: 1.5,
  dairh: 1.5,
  ڈیڑھ: 1.5,
  डेढ़: 1.5,
  dhai: 2.5,
  dhaai: 2.5,
  اڑھائی: 2.5,
  ڈھائی: 2.5,
  ढाई: 2.5,
});
const PLUS: Record<string, number> = nfcKeys({
  sawa: 0.25,
  سوا: 0.25,
  सवा: 0.25,
  saadhe: 0.5,
  sadhe: 0.5,
  saarhe: 0.5,
  ساڑھے: 0.5,
  साढ़े: 0.5,
});
/** The ways of saying percent; "fi sad" and "per cent" are two words. */
const PERCENT = new Set(
  [
    'percent',
    'percentage',
    'pc',
    'feesad',
    'fisad',
    'fesad',
    'feesadi',
    'فیصد',
    'پرسنٹ',
    'प्रतिशत',
    'फ़ीसदी',
    'फीसदी',
    'फ़ीसद',
    'फीसद',
    'परसेंट',
  ].map((w) => w.normalize('NFC')),
);
const PERCENT_PAIRS = new Set(['per cent', 'fi sad', 'fee sad']);
/** Urdu (Extended Arabic-Indic) and Devanagari digits as ASCII digits. */
export function asciiDigits(s: string): string {
  return s
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}
// Punctuation that can stick to a word: Latin, Urdu (، ۔ ؟) and Devanagari (।).
const EDGE = /^([("'“‘]*)(.*?)([)"'”’.,!?;:،۔؟।]*)$/su;
type Tok = { lead: string; word: string; key: string; trail: string };
const tok = (raw: string): Tok => {
  const [, lead = '', word = '', trail = ''] = EDGE.exec(raw) ?? [];
  return { lead, word, key: word.normalize('NFC').toLowerCase(), trail };
};
const isNum = (key: string) => /^\d+(\.\d+)?$/.test(key);
const numberish = (key: string) =>
  key in UNITS || key in SCALES || key in FRACTIONS || key in PLUS || isNum(key);
/** Reads a run of number words from tokens[i]; null when none starts there. */
function readNumber(t: Tok[], i: number): { value: number; next: number } | null {
  let total = 0;
  let current = 0;
  let j = i;
  let plus = 0;
  let scaleOfLast = 1;
  // What the last word was: a digit run, a unit word (paanch, twenty), or a scale (sau, hazaar).
  let prev: 'none' | 'digit' | 'unit' | 'scale' = 'none';
  // sawa / saadhe come first and apply to the whole number that follows.
  if (t[j] && t[j]!.key in PLUS && t[j + 1] && numberish(t[j + 1]!.key)) {
    plus = PLUS[t[j]!.key]!;
    j++;
  }
  while (j < t.length) {
    const k = t[j]!.key;
    // A word with punctuation after it ends the number ("paanch, das" are two numbers).
    const last = t[j]!.trail !== '';
    if (isNum(k)) {
      if (prev === 'digit' || prev === 'unit') break; // "5 10" are two numbers.
      current += Number(k);
      prev = 'digit';
    } else if (k in FRACTIONS || k in UNITS) {
      const v = (FRACTIONS[k] ?? UNITS[k])!;
      // After a unit only an English ten and a unit go together ("twenty five"); after a
      // scale the unit adds ("teen sau pachaas" = 350); after digits it is a new number.
      if (prev === 'digit') break;
      if (prev === 'unit' && !(current % 10 === 0 && current % 100 >= 20 && v < 10)) break;
      current += v;
      prev = 'unit';
    } else if (k in SCALES) {
      if (prev === 'none') break; // "so" alone is the English word; a scale only after a number.
      const s = SCALES[k]!;
      if (s === 100) current = (current || 1) * 100;
      else {
        total += (current || 1) * s;
        current = 0;
      }
      scaleOfLast = s;
      prev = 'scale';
    } else break;
    j++;
    if (last) break;
  }
  if (prev === 'none') return null;
  // sawa / saadhe before a scale word scale the fraction too: saadhe teen sau = 350.
  return { value: total + current + plus * scaleOfLast, next: j };
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
/** "paanch feesad" → "5%", "do sau rupay" → "200 rupay", "پانچ فیصد" → "5%". */
export function normaliseTranscript(text: string): string {
  const parts = asciiDigits(text).split(/(\s+)/u);
  const words: { tok: Tok; space: string }[] = [];
  for (let i = 0; i < parts.length; i += 2)
    if (parts[i]) words.push({ tok: tok(parts[i]!), space: parts[i + 1] ?? '' });
    else if (parts[i + 1] !== undefined && words.length) words.at(-1)!.space += parts[i + 1];
  const lead = /^\s*/u.exec(text)?.[0] ?? '';
  const toks = words.map((w) => w.tok);
  const out: string[] = [];
  let i = 0;
  while (i < toks.length) {
    const n = readNumber(toks, i);
    // A single ambiguous word is only a number next to a percent word or another number
    // ("do" is also "give", "no" is also "no", "so" is also "so").
    if (n) {
      const one = n.next === i + 1;
      const pct = percentAt(toks, n.next, toks[n.next - 1]!.trail);
      const ambiguous = one && AMBIGUOUS.has(toks[i]!.key);
      if (!ambiguous || pct) {
        let s = toks[i]!.lead + fmt(n.value);
        let next = n.next;
        let trail = toks[n.next - 1]!.trail;
        if (pct) {
          s += '%';
          trail = toks[n.next - 1 + pct]!.trail;
          next += pct;
        }
        out.push(s + trail + words[next - 1]!.space);
        i = next;
        continue;
      }
    }
    out.push(toks[i]!.lead + toks[i]!.word + toks[i]!.trail + words[i]!.space);
    i++;
  }
  return lead + out.join('');
}
/**
 * Words that are numbers only beside a percent word or another number word: everyday words too,
 * in Roman Urdu or English, and دو / दो (two, and also give: "chhoot do").
 */
const AMBIGUOUS = new Set([
  'do',
  'no',
  'so',
  'sat',
  'tin',
  'che',
  'char',
  'bis',
  'sath',
  'aat',
  'one',
  'دو',
  'दो',
]);
/** How many tokens of "percent" start at i (0: none); never across punctuation. */
function percentAt(t: Tok[], i: number, trailBefore: string): number {
  if (trailBefore || !t[i]) return 0;
  if (t[i]!.key === '%') return 1;
  if (PERCENT.has(t[i]!.key)) return 1;
  if (!t[i]!.trail && t[i + 1] && PERCENT_PAIRS.has(`${t[i]!.key} ${t[i + 1]!.key}`)) return 2;
  return 0;
}
